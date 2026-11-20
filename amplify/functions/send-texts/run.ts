// The scheduled run, every minute: asks the calendar core to send whatever is due
// (runDue in src/lib/calendar/core.ts). It logs only how many texts ended up in each status.

import { TEXT_STATUSES, type CalendarCore } from '../../../src/lib/calendar';
import { describeError } from '../../calendar/log';

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
      // What broke and where, and nothing about a text or Susan's number. The run is not retried:
      // the next one, a minute later, picks up where this one stopped.
      console.error('Texts run failed', ...describeError(error));
      throw error;
    }
  };
}
