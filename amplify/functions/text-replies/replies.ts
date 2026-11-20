// The calendar's reply address, as a Lambda function URL hands it a request (amplify/backend.ts).
// Textbelt's request is read and checked in amplify/calendar/textbelt.ts, the only code that knows
// Textbelt; a Reply it vouches for goes to the calendar core, which keeps it. Nothing here logs or
// answers with what the request held: not the number, the words or the signature, only the fixed
// words for why one was refused.

import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda';
import type { CalendarCore, Clock } from '../../../src/lib/calendar';
import { logFailure } from '../../calendar/log';
import { readTextbeltReply, type ReplyRejection } from '../../calendar/textbelt';

export interface RepliesDependencies {
  core: () => Promise<CalendarCore>;
  /** The Textbelt key, looked for at each request; null while none is stored. */
  key: () => string | null;
  clock: Clock;
}

type Answer = Exclude<LambdaFunctionURLResult, string> & { headers: Record<string, string> };

const plain = (
  statusCode: number,
  words: string,
  headers: Record<string, string> = {},
): Answer => ({
  statusCode,
  headers: {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex',
    ...headers,
  },
  body: `${words}\n`,
});

/** The answer to each refusal: the same words for every request that is not Textbelt's. */
const REFUSED: Record<ReplyRejection, Answer> = {
  unsigned: plain(401, 'Not accepted.'),
  forged: plain(401, 'Not accepted.'),
  stale: plain(401, 'Not accepted.'),
  unreadable: plain(400, 'Not accepted.'),
};

export function textRepliesHandler({ core, key, clock }: RepliesDependencies) {
  return async (event: LambdaFunctionURLEvent): Promise<Answer> => {
    const method = event.requestContext?.http?.method ?? 'GET';
    if (method !== 'POST') return plain(405, 'Not accepted.', { allow: 'POST' });
    const textbeltKey = key();
    // With no key stored, nothing can prove a request came from Textbelt, so none is taken.
    if (!textbeltKey) {
      console.warn('Reply refused (no key stored)');
      return plain(503, 'Not accepted.');
    }
    const body = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : (event.body ?? '');
    const read = readTextbeltReply(textbeltKey, {
      headers: event.headers ?? {},
      body,
      now: clock.now(),
    });
    if ('rejected' in read) {
      // Fixed words only: why, from a short list.
      console.warn(`Reply refused (${read.rejected})`);
      return REFUSED[read.rejected];
    }
    try {
      // One from any number but Susan's in Settings is kept nowhere, and answered as any other, so
      // the answer says nothing about which numbers the calendar texts.
      const kept = await (await core()).receiveReply(read.reply);
      if (!kept) console.warn('Reply ignored (not from the number in Settings)');
      return plain(200, 'Received.');
    } catch (error) {
      // Fixed words only: the error could quote her words or her number.
      logFailure('Reply', error);
      return plain(503, 'Not received. Try again later.', { 'retry-after': '60' });
    }
  };
}
