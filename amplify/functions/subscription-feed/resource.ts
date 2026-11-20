import { defineFunction } from '@aws-amplify/backend';
import { resolveTimeZone } from '../../../src/lib/timeZone';

/**
 * Serves the calendar subscription's feed at a public address (amplify/backend.ts), to anyone who
 * has a working link. It only reads calendar data, straight from the tables with strongly consistent
 * reads (amplify/calendar/feed-store.ts).
 */
export const subscriptionFeed = defineFunction({
  name: 'subscription-feed',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 15,
  memoryMB: 512,
  // Beside the data stack, whose tables it reads.
  resourceGroupName: 'data',
  environment: {
    // Susan's time zone. A value that isn't a time zone fails the deploy (src/lib/timeZone.ts).
    SUSAN_TIME_ZONE: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
  },
});
