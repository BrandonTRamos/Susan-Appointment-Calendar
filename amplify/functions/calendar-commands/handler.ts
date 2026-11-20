import { createCalendarCore, systemClock, type CalendarCore } from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { createDataStore } from '../../calendar/data-store';
import { rememberedNames, userPoolNames } from '../../calendar/people';
import { calendarCommandHandler } from './commands';

let core: Promise<CalendarCore> | undefined;

function getCore() {
  core ??= createDataStore()
    .then((store) =>
      createCalendarCore({
        store,
        clock: systemClock,
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
  nameOf: rememberedNames(userPoolNames(process.env.USER_POOL_ID ?? '')),
});
