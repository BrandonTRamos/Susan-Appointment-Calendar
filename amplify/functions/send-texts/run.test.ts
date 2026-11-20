import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  createMemoryStore,
  createStandInSender,
  type Actor,
  type CalendarCore,
} from '../../../src/lib/calendar';
import { sendTextsHandler } from './run';

const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };

/** The scheduled run over a calendar in memory, with one Appointment whose Reminder is due. */
async function run() {
  const store = createMemoryStore();
  const clock = createFixedClock('2026-11-19T20:00:00.000Z');
  const sender = createStandInSender();
  const core = createCalendarCore({
    store,
    clock,
    messenger: createMemoryMessenger(),
    textSender: sender,
    timeZone: 'America/New_York',
  });
  await core.changeSettings(linda, { susansNumber: '+15555550123' });
  await core.addAppointment(linda, {
    what: 'Cardiology check-up',
    date: '2026-11-20',
    time: '14:00',
    noteForSusan: 'Bring your list of medicines.',
  });
  clock.set('2026-11-19T23:00:00.000Z');
  return { store, sender, handler: sendTextsHandler({ core: async () => core }) };
}

afterEach(() => vi.restoreAllMocks());

describe('the scheduled run', () => {
  it('sends what is due, and logs only how many texts ended up in each status', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { handler, sender } = await run();
    await handler();
    expect(sender.taken()).toHaveLength(1);
    const words = logged.mock.calls.flat().join(' ');
    expect(words).toBe('Texts run waiting 0, sent 1, delivered 0, failed 0, notSent 0');
  });

  it('logs nothing when nothing was due', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { handler } = await run();
    await handler();
    logged.mockClear();
    await handler();
    expect(logged).not.toHaveBeenCalled();
  });

  it("fails without putting Susan's number or a text's words in the log or the error", async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // An error that repeats, unquoted, what it was sent.
    const leak = new Error(
      "Could not send Susan's Calendar: Cardiology check-up, tomorrow at 2:00 pm to +1 555 555 0123",
    );
    const handler = sendTextsHandler({
      core: async () =>
        ({
          runDue: async () => {
            throw leak;
          },
        }) as unknown as CalendarCore,
    });
    const thrown = await handler().then(
      () => null,
      (error: unknown) => error as Error,
    );
    // What Lambda reports is a fresh error, with nothing of the first.
    expect(thrown).not.toBe(leak);
    expect(thrown?.message).toBe('Texts run failed (unknown)');
    expect(thrown?.cause).toBeUndefined();
    expect(`${thrown?.stack}`).not.toMatch(/555|Cardiology/);
    expect(logged.mock.calls.flat().join(' ')).toBe('Texts run failed (unknown)');
  });
});
