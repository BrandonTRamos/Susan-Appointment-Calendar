// The scheduled run, every minute: asks the calendar core to send whatever is due
// (runDue in src/lib/calendar/core.ts). It logs only how many texts ended up in each status.

import { TEXT_STATUSES, type CalendarCore } from '../../../src/lib/calendar';
import { logFailure } from '../../calendar/log';

export interface RunDependencies {
  core: () => Promise<CalendarCore>;
}

export function sendTextsHandler({ core }: RunDependencies) {
  return async (): Promise<void> => {
    try {
      const done = await (await core()).runDue();
      if (done.length === 0) return;
      const counts = TEXT_STATUSES.map(
        (status) => `${status} ${done.filter((text) => text.status === status).length}`,
      );
      console.log('Texts run', counts.join(', '));
    } catch (error) {
      // Fixed words only: the error can quote Susan's number or a text's words. What reaches
      // Lambda is a fresh error saying the same, with nothing of the first. The run is not
      // retried: the next one, a minute later, picks up where this one stopped.
      // eslint-disable-next-line preserve-caught-error -- the cause could quote a number or a text
      throw new Error(logFailure('Texts run', error));
    }
  };
}
