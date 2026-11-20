// The MCP server's public address, as a Lambda function URL hands it a request (amplify/backend.ts).
// It checks the agent key, then serves the Model Context Protocol over Streamable HTTP, stateless
// and answering in JSON, as Wellbeing's does, with the official MCP library. Every tool acts through
// the calendar core as the key's person, via agent (server.ts).
//
// A call without a working key is turned away before anything about the calendar is read, and a
// missing, malformed, wrong or revoked key, or one whose account is disabled or gone, all get the
// one same answer. Nothing here logs the key, which is in the request's headers.

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda';
import { isAgentKey, type Actor, type CalendarCore, type Clock } from '../../../src/lib/calendar';
import { logFailure } from '../../calendar/log';
import { displayName } from '../../calendar/people';
import { createMcpServer } from './server';

/** A person's account, as the user pool has it now. */
export interface Account {
  /** The name the calendar calls them by, or null when the account has none. */
  name: string | null;
  /** False once the owner has disabled the account: then neither they nor their agent may act. */
  enabled: boolean;
}

export interface McpDependencies {
  core: () => Promise<CalendarCore>;
  /** The account with this person ID, or null when there is none. */
  account: (personId: string) => Promise<Account | null>;
  clock: Clock;
  /** Susan's time zone, from resolveTimeZone (src/lib/timeZone.ts). */
  timeZone: string;
}

type Answer = Exclude<LambdaFunctionURLResult, string> & { headers: Record<string, string> };

/** The only address served. */
const PATHS = new Set(['/mcp', '/mcp/']);

/** No call an agent makes comes near this; anything larger is turned away unread. */
const MOST_BYTES = 1_000_000;

/** Every answer: never kept by a cache on the way. */
const HEADERS = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

const json = (statusCode: number, body: unknown, headers: Record<string, string> = {}): Answer => ({
  statusCode,
  headers: { ...HEADERS, 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

/** A JSON-RPC error, as an MCP client reads one. */
const rpcError = (code: number, message: string) => ({
  jsonrpc: '2.0',
  error: { code, message },
  id: null,
});

/** For every call without a working key, whatever was wrong with it. */
const refused = () =>
  json(
    401,
    rpcError(
      -32001,
      'This needs a working agent key, sent as "Authorization: Bearer <key>". Make one in Susan\'s Calendar, in Settings, under "Agent keys".',
    ),
    { 'www-authenticate': 'Bearer realm="susans-calendar", error="invalid_token"' },
  );

/** The key the call carries, or null when it carries nothing that could be one. */
function bearer(event: LambdaFunctionURLEvent): string | null {
  const header = event.headers?.authorization ?? event.headers?.Authorization;
  const key = /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1] ?? null;
  return isAgentKey(key) ? key : null;
}

/** The request as the MCP library's transport reads it. */
function toRequest(event: LambdaFunctionURLEvent): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(event.headers ?? {}))
    if (value !== undefined) headers.set(name, value);
  const body = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : event.body;
  return new Request(`https://${event.requestContext.domainName}${event.rawPath}`, {
    method: event.requestContext.http.method,
    headers,
    body,
  });
}

export function mcpHandler({ core, account, clock, timeZone }: McpDependencies) {
  return async (event: LambdaFunctionURLEvent): Promise<Answer> => {
    if (!PATHS.has(event.rawPath ?? ''))
      return json(404, rpcError(-32000, 'Not found. The address ends in /mcp.'));
    // Stateless: no stream from the server (GET) and no session to end (DELETE).
    if (event.requestContext?.http?.method !== 'POST')
      return json(405, rpcError(-32000, 'Method not allowed.'), { allow: 'POST' });

    // Before the key, so that how large a request is never makes one key's answer differ.
    const bytes = Buffer.byteLength(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8');
    if (bytes > MOST_BYTES) return json(413, rpcError(-32000, 'Request too large.'));
    const key = bearer(event);
    if (!key) return refused();

    let calendar: CalendarCore;
    let by: Actor;
    try {
      calendar = await core();
      const personId = await calendar.agentKeyOwner(key);
      if (!personId) return refused();
      // A key acts as its person only while their account stands.
      const found = await account(personId);
      if (!found?.enabled) return refused();
      by = { person: { id: personId, name: displayName(found.name) }, viaAgent: true };
    } catch (error) {
      // Fixed words only: the error could quote the key.
      logFailure('MCP server', error);
      return json(503, rpcError(-32000, 'The calendar could not be reached. Try again shortly.'), {
        'retry-after': '60',
      });
    }

    const server = createMcpServer({ core: calendar, by, clock, timeZone });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(toRequest(event));
      const headers: Record<string, string> = { ...HEADERS };
      response.headers.forEach((value, name) => (headers[name] = value));
      return { statusCode: response.status, headers, body: await response.text() };
    } catch (error) {
      // Fixed words only: the error could quote what the agent sent.
      logFailure('MCP request', error);
      return json(
        500,
        rpcError(-32603, 'The request could not be carried out. Try again shortly.'),
      );
    } finally {
      await server.close();
    }
  };
}
