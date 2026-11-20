import {
  createCalendarCore,
  resolveConfirmationMinutes,
  systemClock,
  type CalendarCore,
} from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { sesEmailSender } from '../../calendar/alert-email';
import { adminMessenger, userPoolAdmins, webPushSender } from '../../calendar/admin-messenger';
import { dataApiDevices, type DeviceClient } from '../../calendar/app-notification-devices';
import { connectDataApi, dataStore, type DataClient } from '../../calendar/data-store';
import { textSenderFor } from '../../calendar/text-sender';
import { sendTextsHandler } from './run';

const appUrl = process.env.APP_URL ?? 'mailto:noreply@example.com';
/** The verified address Alerts are emailed from; unset, they go by app notification only. */
const alertsFrom = process.env.ALERT_EMAIL_FROM;

let core: Promise<CalendarCore> | undefined;

function getCore() {
  core ??= connectDataApi()
    .then((client: unknown) =>
      createCalendarCore({
        // The data API's own client type is too deep to compare against both narrow ones.
        store: dataStore(client as DataClient),
        clock: systemClock,
        textSender: textSenderFor(),
        // Alerts go to every Admin, by app notification and by email (amplify/calendar).
        messenger: adminMessenger({
          admins: userPoolAdmins(process.env.USER_POOL_ID ?? ''),
          devices: dataApiDevices(client as DeviceClient),
          push: webPushSender(appUrl),
          email: alertsFrom ? sesEmailSender({ from: alertsFrom }) : null,
          appUrl,
        }),
        timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
        unconfirmedAfter:
          resolveConfirmationMinutes(process.env.TEXT_CONFIRMATION_MINUTES) * 60_000,
      }),
    )
    .catch((error: unknown) => {
      core = undefined; // try again on the next run instead of keeping the failure
      throw error;
    });
  return core;
}

export const handler = sendTextsHandler({ core: getCore });
