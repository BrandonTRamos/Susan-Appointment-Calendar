import { createCalendarCore, systemClock, type CalendarCore } from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { adminMessenger, userPoolAdmins, webPushSender } from '../../calendar/admin-messenger';
import { dataApiDevices, type DeviceClient } from '../../calendar/app-notification-devices';
import { connectDataApi, dataStore, type DataClient } from '../../calendar/data-store';
import { rememberedNames, userPoolNames } from '../../calendar/people';
import { textSenderFor } from '../../calendar/text-sender';
import { calendarCommandHandler } from './commands';

const userPoolId = process.env.USER_POOL_ID ?? '';

let core: Promise<CalendarCore> | undefined;

function getCore() {
  core ??= connectDataApi()
    .then((client: unknown) =>
      createCalendarCore({
        // The data API's own client type is too deep to compare against both narrow ones.
        store: dataStore(client as DataClient),
        clock: systemClock,
        textSender: textSenderFor(),
        messenger: adminMessenger({
          admins: userPoolAdmins(userPoolId),
          devices: dataApiDevices(client as DeviceClient),
          push: webPushSender(process.env.APP_URL ?? 'mailto:noreply@example.com'),
        }),
        timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
      }),
    )
    .catch((error: unknown) => {
      core = undefined; // try again on the next command instead of keeping the failure
      throw error;
    });
  return core;
}

export const handler = calendarCommandHandler({
  core: getCore,
  nameOf: rememberedNames(userPoolNames(userPoolId)),
});
