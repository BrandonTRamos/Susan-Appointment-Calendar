import { createCalendarCore, systemClock } from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { createDataStore } from '../../calendar/data-store';
import { seriesTopUpHandler } from './topUp';

export const handler = seriesTopUpHandler(async () =>
  createCalendarCore({
    store: await createDataStore(),
    clock: systemClock,
    timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
  }),
);
