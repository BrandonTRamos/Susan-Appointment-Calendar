import { defineFunction, secret } from '@aws-amplify/backend';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { appUrl } from '../../app-url';
import { TEXTBELT_KEY } from '../../calendar/text-sender';

/**
 * Runs the calendar core's commands for the data API (amplify/data/resource.ts), and says which
 * text sender is in use. It and the scheduled run are the only things that may write calendar data.
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
    // Names the sender of app notifications to Apple's, Google's and the other push services.
    APP_URL: appUrl(),
    // The Textbelt key, for the test text; while none is stored, texts go to the stand-in
    // (amplify/calendar/text-sender.ts).
    [TEXTBELT_KEY]: secret(TEXTBELT_KEY),
  },
});
