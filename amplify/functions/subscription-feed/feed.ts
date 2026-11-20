// The calendar subscription's public address, as a Lambda function URL hands it a request
// (amplify/backend.ts). The link's secret is the whole path; the calendar core decides whether it
// is a working link and writes the feed. Nothing here logs the path, which is the secret.

import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda';
import type { CalendarCore } from '../../../src/lib/calendar';

export interface FeedDependencies {
  core: () => Promise<CalendarCore>;
}

type Answer = Exclude<LambdaFunctionURLResult, string> & { headers: Record<string, string> };

/** Every answer: never kept by a cache on the way, so each refresh reads the calendar afresh. */
const HEADERS = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex',
};

const plain = (
  statusCode: number,
  words: string,
  headers: Record<string, string> = {},
): Answer => ({
  statusCode,
  headers: { ...HEADERS, 'content-type': 'text/plain; charset=utf-8', ...headers },
  body: `${words}\n`,
});

/** For any address that is not a working link, switched off or never one alike. */
const NOT_FOUND = plain(404, 'Not found.');

export function subscriptionFeedHandler({ core }: FeedDependencies) {
  return async (event: LambdaFunctionURLEvent): Promise<Answer> => {
    const method = event.requestContext?.http?.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD')
      return plain(405, 'This calendar can only be read.', { allow: 'GET, HEAD' });
    try {
      const feed = await (await core()).subscriptionFeed((event.rawPath ?? '').slice(1));
      if (feed === null) return NOT_FOUND;
      return {
        statusCode: 200,
        headers: { ...HEADERS, 'content-type': 'text/calendar; charset=utf-8' },
        body: method === 'HEAD' ? '' : feed,
      };
    } catch (error) {
      // What broke and where, and nothing about the link or the calendar.
      const e = error instanceof Error ? error : null;
      console.error(
        'Calendar feed failed',
        e?.name ?? 'Unknown error',
        e?.message.slice(0, 300) ?? '',
        e?.stack?.split('\n').slice(1, 6).join(' | ') ?? '',
      );
      return plain(503, 'The calendar could not be read just now. Try again later.', {
        'retry-after': '300',
      });
    }
  };
}
