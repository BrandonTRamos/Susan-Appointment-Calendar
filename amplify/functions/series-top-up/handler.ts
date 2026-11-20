import { createCalendarCore, NO_ADMIN_MESSENGER, systemClock } from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { createDataStore } from '../../calendar/data-store';
import { seriesTopUpHandler } from './topUp';

// The top-up tells nobody anything: nobody acted, and the Activity update for the Series went out
// when it was added or changed. So its core has no Admin messenger.
export const handler = seriesTopUpHandler(async () =>
  createCalendarCore({
    store: await createDataStore(),
    clock: systemClock,
    messenger: NO_ADMIN_MESSENGER,
    timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
  }),
);
