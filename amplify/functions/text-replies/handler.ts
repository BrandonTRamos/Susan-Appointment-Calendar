import {
  createCalendarCore,
  NO_ADMIN_MESSENGER,
  NO_TEXT_SENDER,
  systemClock,
  type CalendarCore,
} from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { connectDataApi, dataStore, type DataClient } from '../../calendar/data-store';
import { replyKey } from '../../calendar/text-sender';
import { textRepliesHandler } from './replies';

let core: Promise<CalendarCore> | undefined;

function getCore() {
  core ??= connectDataApi()
    .then((client: unknown) =>
      createCalendarCore({
        // The data API's own client type is too deep to compare against the narrow one.
        store: dataStore(client as DataClient),
        clock: systemClock,
        // It only keeps the Reply: the scheduled run passes it on and answers her.
        textSender: NO_TEXT_SENDER,
        messenger: NO_ADMIN_MESSENGER,
        timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
      }),
    )
    .catch((error: unknown) => {
      core = undefined; // try again on the next request instead of keeping the failure
      throw error;
    });
  return core;
}

export const handler = textRepliesHandler({
  core: getCore,
  // Looked for at each request: Amplify refreshes a function's secrets while it runs.
  key: () => replyKey(),
  clock: systemClock,
});
