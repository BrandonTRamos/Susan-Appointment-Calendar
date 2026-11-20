import { defineFunction } from '@aws-amplify/backend';
import { resolveTimeZone } from '../../../src/lib/timeZone';

/**
 * Runs the calendar core's commands for the data API (amplify/data/resource.ts). It is the only
 * thing that may write calendar data.
 */
export const calendarCommands = defineFunction({
  name: 'calendar-commands',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  memoryMB: 512,
  // Deployed alongside the data stack, which avoids a circular stack dependency.
  resourceGroupName: 'data',
  environment: {
    // Susan's time zone. A value that isn't a time zone fails the deploy (src/lib/timeZone.ts).
    SUSAN_TIME_ZONE: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
  },
});
