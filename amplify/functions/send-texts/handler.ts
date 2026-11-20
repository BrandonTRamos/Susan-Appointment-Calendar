import { createCalendarCore, systemClock, type CalendarCore } from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { createDataStore } from '../../calendar/data-store';
import { textSenderFor } from '../../calendar/text-sender';
import { sendTextsHandler } from './run';

let core: Promise<CalendarCore> | undefined;

function getCore() {
  core ??= createDataStore()
    .then((store) =>
      createCalendarCore({
        store,
        clock: systemClock,
        textSender: textSenderFor(),
        timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
      }),
    )
    .catch((error: unknown) => {
      core = undefined; // try again on the next run instead of keeping the failure
      throw error;
    });
  return core;
}

export const handler = sendTextsHandler({ core: getCore });
