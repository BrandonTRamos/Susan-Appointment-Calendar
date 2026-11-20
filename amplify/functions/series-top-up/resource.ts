import { defineFunction } from '@aws-amplify/backend';
import { resolveTimeZone } from '../../../src/lib/timeZone';

/**
 * Tops up every Series once a day (topUpSeries in src/lib/calendar/core.ts), so that a Series with
 * no end always has its Appointments made ahead. It sends nothing: sending texts is the scheduled
 * run's job, apart from this.
 */
export const seriesTopUp = defineFunction({
  name: 'series-top-up',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 300,
  memoryMB: 512,
  // 8:00 UTC: the early morning in US Eastern, when nobody is likely to be changing a Series.
  schedule: '0 8 * * ?',
  // Deployed alongside the data stack, which avoids a circular stack dependency.
  resourceGroupName: 'data',
  environment: {
    // Susan's time zone. A value that isn't a time zone fails the deploy (src/lib/timeZone.ts).
    SUSAN_TIME_ZONE: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
  },
});
