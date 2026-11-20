// How the MCP server finds an agent key: straight from the AgentKey table, by its hash, with a
// strongly consistent read.
//
// The data API's own reads are eventually consistent (feed-store.ts says why), so a key read
// through it could keep working for a moment after it was revoked. Read this way, a revoked key is
// refused from the moment its revocation is written. Every write of a key still goes through the
// calendar core and the data API (docs/adr/0003-the-core-writes-through-the-data-api.md); this
// writes nothing.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { AgentKey, Store } from '../../src/lib/calendar';
import { toAgentKey } from '../../src/lib/calendarApi';

/** The part of the DynamoDB document client this uses. */
export interface KeyReader {
  send(command: GetCommand): Promise<{ Item?: Record<string, unknown> }>;
}

/** Finds the agent key with this hash as the table holds it now. */
export function tableAgentKeys(reader: KeyReader, table: string): Store['agentKeyByHash'] {
  return async (hash) => {
    const { Item } = await reader.send(
      new GetCommand({ TableName: table, Key: { hash }, ConsistentRead: true }),
    );
    return Item ? toAgentKey(Item as unknown as AgentKey) : null;
  };
}

/** The finder for the MCP server, over the table named in its environment (amplify/backend.ts). */
export function createTableAgentKeys(env: NodeJS.ProcessEnv = process.env) {
  const table = env.AGENT_KEY_TABLE;
  if (!table) throw new Error('The MCP server has not been told the agent key table.');
  return tableAgentKeys(DynamoDBDocumentClient.from(new DynamoDBClient({})), table);
}
