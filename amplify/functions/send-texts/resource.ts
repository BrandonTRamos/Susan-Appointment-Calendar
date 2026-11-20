import { defineFunction, secret } from '@aws-amplify/backend';
import { resolveConfirmationMinutes } from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { TEXTBELT_KEY } from '../../calendar/text-sender';

/**
 * The scheduled run: every minute it asks the calendar core to send whatever is due, and asks
 * Textbelt what became of the texts already sent (amplify/functions/send-texts/run.ts). It never
 * overlaps itself: amplify/backend.ts lets only one run at a time and drops a run that cannot
 * start, rather than queueing it.
 */
export const sendTexts = defineFunction({
  name: 'send-texts',
  entry: './handler.ts',
  runtime: 22,
  // Shorter than the minute between runs, and than RETRY_AFTER in src/lib/calendar/texts.ts.
  timeoutSeconds: 50,
  memoryMB: 512,
  schedule: 'every 1m',
  // It writes through the data API, so it is deployed alongside the data stack.
  resourceGroupName: 'data',
  environment: {
    // Susan's time zone. A value that isn't a time zone fails the deploy (src/lib/timeZone.ts).
    SUSAN_TIME_ZONE: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
    // How long a text may go unconfirmed before it counts as not confirmed delivered; 30 minutes
    // unless the deploy says. A value that isn't a number of minutes fails the deploy.
    TEXT_CONFIRMATION_MINUTES: String(
      resolveConfirmationMinutes(process.env.TEXT_CONFIRMATION_MINUTES),
    ),
    // The Textbelt key, from the deployment secret; while none is stored, texts go to the
    // stand-in (amplify/calendar/text-sender.ts).
    [TEXTBELT_KEY]: secret(TEXTBELT_KEY),
  },
});
