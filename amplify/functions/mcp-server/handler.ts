import {
  createCalendarCore,
  NO_TEXT_SENDER,
  systemClock,
  type CalendarCore,
} from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { adminMessenger, userPoolAdmins, webPushSender } from '../../calendar/admin-messenger';
import { createTableAgentKeys } from '../../calendar/agent-key-table';
import { dataApiDevices, type DeviceClient } from '../../calendar/app-notification-devices';
import { connectDataApi, dataStore, type DataClient } from '../../calendar/data-store';
import { userPoolAccounts } from '../../calendar/people';
import { mcpHandler } from './http';

const userPoolId = process.env.USER_POOL_ID ?? '';
const timeZone = resolveTimeZone(process.env.SUSAN_TIME_ZONE);

let core: Promise<CalendarCore> | undefined;

function getCore() {
  core ??= connectDataApi()
    .then((client: unknown) =>
      createCalendarCore({
        // Writes go through the data API, as every command's do; a key is found in its own table,
        // with a strongly consistent read (amplify/calendar/agent-key-table.ts).
        store: {
          ...dataStore(client as DataClient),
          agentKeyByHash: createTableAgentKeys(),
        },
        clock: systemClock,
        // Its tools send no text: texts go out only on the scheduled run.
        textSender: NO_TEXT_SENDER,
        // Activity updates go to the other Admins by app notification; Alerts are the run's.
        messenger: adminMessenger({
          admins: userPoolAdmins(userPoolId),
          devices: dataApiDevices(client as DeviceClient),
          push: webPushSender(process.env.APP_URL ?? 'mailto:noreply@example.com'),
        }),
        timeZone,
      }),
    )
    .catch((error: unknown) => {
      core = undefined; // try again on the next request instead of keeping the failure
      throw error;
    });
  return core;
}

export const handler = mcpHandler({
  core: getCore,
  account: userPoolAccounts(userPoolId),
  clock: systemClock,
  timeZone,
});
