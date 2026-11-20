import {
  createCalendarCore,
  NO_ADMIN_MESSENGER,
  NO_TEXT_SENDER,
  systemClock,
} from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { createDataStore } from '../../calendar/data-store';
import { seriesTopUpHandler } from './topUp';

// The top-up tells nobody anything and texts nobody: nobody acted, the Activity update for the
// Series went out when it was added or changed, and sending is the scheduled run's job. So its core
// has no Admin messenger and no text sender.
export const handler = seriesTopUpHandler(async () =>
  createCalendarCore({
    store: await createDataStore(),
    clock: systemClock,
    messenger: NO_ADMIN_MESSENGER,
    textSender: NO_TEXT_SENDER,
    timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
  }),
);
