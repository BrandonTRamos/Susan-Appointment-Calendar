import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  createMemoryStore,
  createStandInSender,
  type Actor,
} from '../../../src/lib/calendar';
import { seriesTopUpHandler } from './topUp';

const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };

afterEach(() => vi.restoreAllMocks());

describe('the daily Series top-up', () => {
  it('makes the Appointments each Series still needs', async () => {
    const store = createMemoryStore();
    const clock = createFixedClock('2026-11-19T20:00:00.000Z');
    const messenger = createMemoryMessenger(['person-linda', 'person-mark']);
    const textSender = createStandInSender();
    const timeZone = 'America/New_York';
    const core = createCalendarCore({ store, clock, messenger, textSender, timeZone });
    await core.addSeries(linda, {
      what: 'Dialysis',
      date: '2026-11-23',
      time: '09:00',
      repeat: { every: 'week', weekdays: [0, 3] },
    });
    const made = store.appointments().length;
    clock.set('2027-01-19T20:00:00.000Z');
    await seriesTopUpHandler(async () => core)();
    expect(store.appointments().length).toBeGreaterThan(made);
    // One Activity update, for the add; none for the Appointments the top-up made.
    expect(messenger.appNotifications()).toHaveLength(1);
    expect(textSender.taken()).toEqual([]);
    // Nor an Alert email.
    expect(messenger.emails()).toEqual([]);
  });

  it('logs what broke without anything about an Appointment, and fails the run', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = seriesTopUpHandler(async () => {
      throw new Error('The data API is not answering');
    });
    await expect(run()).rejects.toThrow('The Series top-up failed.');
    expect(logged.mock.calls.flat().join(' ')).toContain('The data API is not answering');
  });
});
