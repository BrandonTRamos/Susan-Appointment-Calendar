import { defineFunction } from '@aws-amplify/backend';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { appUrl } from '../../app-url';
import { resolveAlertSender } from '../../calendar/alert-email';

/**
 * The scheduled run: every minute it asks the calendar core to send whatever is due
 * (amplify/functions/send-texts/run.ts), and raises an Alert to every Admin about each text that
 * did not get through. It never overlaps itself: amplify/backend.ts lets only one run at a time and
 * drops a run that cannot start, rather than queueing it.
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
    // Names the sender of app notifications to the push services, and is the address an Alert
    // email links to.
    APP_URL: appUrl(),
    // The verified address Alerts are emailed from. Empty, they go by app notification only; a
    // value that isn't an email address fails the deploy.
    ALERT_EMAIL_FROM: resolveAlertSender(process.env.ALERT_EMAIL_FROM) ?? '',
  },
});
