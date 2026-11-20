// The daily top-up of every Series, as the schedule calls it. The core decides what each Series
// still needs; this only runs it and logs what broke.

import type { CalendarCore } from '../../../src/lib/calendar';

export function seriesTopUpHandler(core: () => Promise<CalendarCore>) {
  return async (): Promise<void> => {
    try {
      await (await core()).topUpSeries();
    } catch (error) {
      // What broke and where, and nothing about any Appointment. The next day's run tries again.
      const e = error instanceof Error ? error : null;
      console.error(
        'Series top-up failed',
        e?.name ?? 'Unknown error',
        e?.message.slice(0, 300) ?? '',
        e?.stack?.split('\n').slice(1, 6).join(' | ') ?? '',
      );
      throw new Error('The Series top-up failed.', { cause: error });
    }
  };
}
