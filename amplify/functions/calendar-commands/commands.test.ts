import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CalendarRefusal,
  createCalendarCore,
  createFixedClock,
  createMemoryStore,
} from '../../../src/lib/calendar';
import { calendarCommandHandler, type CommandEvent } from './commands';

const checkUp = { what: 'Cardiology check-up', date: '2026-11-20', time: '14:00' };
const linda = { sub: 'person-linda', username: 'account-linda' };

/** The commands as the data API would call them, over a calendar kept in memory. */
function commands(names: Record<string, string | null> = { 'account-linda': 'Linda' }) {
  const store = createMemoryStore();
  const core = createCalendarCore({
    store,
    clock: createFixedClock('2026-11-19T20:00:00.000Z'),
    timeZone: 'America/New_York',
  });
  const nameOf = vi.fn(async (username: string) => names[username] ?? null);
  const handler = calendarCommandHandler({ core: async () => core, nameOf });
  /** Calls a mutation the way Amplify Gen 2 does: its name at the top, JSON arguments as text. */
  const call = (
    fieldName: string,
    args: Record<string, unknown>,
    caller: { identity: unknown } = { identity: linda },
  ) => handler({ fieldName, arguments: args, identity: caller.identity } as CommandEvent);
  return { store, call, handler, nameOf };
}

afterEach(() => vi.restoreAllMocks());

describe('the commands, as the data API calls them', () => {
  it('add, change, cancel and delete an Appointment', async () => {
    const { store, call } = commands();
    const added = await call('addAppointment', { details: JSON.stringify(checkUp) });
    expect(added).toMatchObject({ ...checkUp, state: 'active' });
    expect(store.appointments()).toEqual([added]);

    const { id } = added!;
    const changed = await call('changeAppointment', {
      id,
      changes: JSON.stringify({ time: '15:30' }),
    });
    expect(changed).toMatchObject({ id, time: '15:30', what: 'Cardiology check-up' });

    expect(await call('cancelAppointment', { id })).toMatchObject({ id, state: 'cancelled' });
    expect(store.appointments()).toMatchObject([{ id, state: 'cancelled', time: '15:30' }]);

    expect(await call('removeAppointment', { id })).toBeNull();
    expect(store.appointments()).toEqual([]);
    expect(store.activity().map((record) => record.action)).toEqual([
      'added',
      'changed',
      'cancelled',
      'deleted',
    ]);
  });

  it('also take a mutation named the way AppSync itself names it, with arguments not as text', async () => {
    const { store, handler } = commands();
    await handler({
      info: { fieldName: 'addAppointment' },
      arguments: { details: checkUp },
      identity: linda,
    });
    expect(store.appointments()).toMatchObject([checkUp]);
  });
});

describe('who a command is carried out for', () => {
  it('is the signed-in person, by the name on their account, acting themselves', async () => {
    const { call, nameOf } = commands();
    const added = await call('addAppointment', { details: JSON.stringify(checkUp) });
    expect(nameOf).toHaveBeenCalledWith('account-linda');
    expect(added!.added).toMatchObject({
      personId: 'person-linda',
      personName: 'Linda',
      viaAgent: false,
    });
  });

  it('never comes from what the caller sent', async () => {
    const { call } = commands();
    const forged = {
      ...checkUp,
      added: { personId: 'person-mark', personName: 'Mark', viaAgent: true, at: '2020-01-01' },
      personName: 'Mark',
      viaAgent: true,
    };
    const added = await call('addAppointment', { details: JSON.stringify(forged) });
    expect(added!.added).toEqual({
      personId: 'person-linda',
      personName: 'Linda',
      viaAgent: false,
      at: '2026-11-19T20:00:00.000Z',
    });
  });

  it('is "Someone" when the account has no name', async () => {
    const { call } = commands({ 'account-linda': '   ' });
    const added = await call('addAppointment', { details: JSON.stringify(checkUp) });
    expect(added!.added.personName).toBe('Someone');
  });

  it.each([
    null,
    undefined,
    {},
    { sub: 'person-linda' },
    { username: 'account-linda' },
    { sub: '', username: '' },
  ])('is nobody unless a person is signed in (%j)', async (identity) => {
    const { store, call } = commands();
    await expect(
      call('addAppointment', { details: JSON.stringify(checkUp) }, { identity }),
    ).rejects.toThrow(/Sign in/);
    expect(store.appointments()).toEqual([]);
  });
});

describe('when a command cannot be carried out', () => {
  it("a refusal reaches the person in the core's own words", async () => {
    const { store, call } = commands();
    await expect(
      call('addAppointment', { details: JSON.stringify({ ...checkUp, what: '' }) }),
    ).rejects.toThrow('Say what the Appointment is.');
    await expect(call('addAppointment', { details: 'not json' })).rejects.toBeInstanceOf(
      CalendarRefusal,
    );
    await expect(call('cancelAppointment', { id: 'no-such-appointment' })).rejects.toThrow(
      /not in the calendar/,
    );
    const { id } = (await call('addAppointment', { details: JSON.stringify(checkUp) }))!;
    store.noteTextSentAbout(id);
    await expect(call('removeAppointment', { id })).rejects.toThrow(/Cancel it instead/);
    expect(store.appointments()).toHaveLength(1);
  });

  it('a failure says to try again, and logs what broke without the Appointment', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = calendarCommandHandler({
      core: async () => {
        throw new Error('The data API is not answering');
      },
      nameOf: async () => 'Linda',
    });
    const secret = { ...checkUp, privateNotes: 'Insurance number 12345' };
    await expect(
      handler({
        fieldName: 'addAppointment',
        arguments: { details: JSON.stringify(secret) },
        identity: linda,
      }),
    ).rejects.toThrow('Could not save the change. Check your connection and try again.');
    const words = logged.mock.calls.flat().join(' ');
    expect(words).toContain('The data API is not answering');
    expect(words).not.toContain('Cardiology');
    expect(words).not.toContain('12345');
  });

  it('a command the calendar does not have is a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, call } = commands();
    await expect(call('deleteEverything', {})).rejects.toThrow(/Could not save/);
    await expect(call('deleteAppointment', { id: 'x' })).rejects.toThrow(/Could not save/);
    expect(store.activity()).toEqual([]);
  });
});
