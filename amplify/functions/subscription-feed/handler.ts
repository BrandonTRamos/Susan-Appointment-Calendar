import {
  createCalendarCore,
  NO_TEXT_SENDER,
  systemClock,
  type CalendarCore,
} from '../../../src/lib/calendar';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { createFeedStore } from '../../calendar/feed-store';
import { subscriptionFeedHandler } from './feed';

let core: Promise<CalendarCore> | undefined;

function getCore() {
  // Read straight from the tables, consistently (amplify/calendar/feed-store.ts).
  core ??= Promise.resolve()
    .then(() =>
      createCalendarCore({
        store: createFeedStore(),
        clock: systemClock,
        textSender: NO_TEXT_SENDER,
        timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
      }),
    )
    .catch((error: unknown) => {
      core = undefined; // try again on the next request instead of keeping the failure
      throw error;
    });
  return core;
}

export const handler = subscriptionFeedHandler({ core: getCore });
