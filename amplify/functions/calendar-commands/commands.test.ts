import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  createMemoryStore,
  type Appointment,
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
  /** Adds an Appointment and hands it back. */
  const add = async (details: object = checkUp) => {
    const answer = await call('addAppointment', { details: JSON.stringify(details) });
    return (answer as { appointment: Appointment }).appointment;
  };
  return { store, call, add, handler, nameOf };
}

afterEach(() => vi.restoreAllMocks());

describe('the commands, as the data API calls them', () => {
  it('add, change, cancel and delete an Appointment, answering with it as it now is', async () => {
    const { store, call } = commands();
    const added = await call('addAppointment', { details: JSON.stringify(checkUp) });
    expect(added).toEqual({ appointment: store.appointments()[0] });
    expect(added).toMatchObject({ appointment: { ...checkUp, state: 'active' } });

    const { id } = store.appointments()[0];
    const changed = await call('changeAppointment', {
      id,
      changes: JSON.stringify({ time: '15:30' }),
    });
    expect(changed).toMatchObject({
      appointment: { id, time: '15:30', what: 'Cardiology check-up' },
    });

    expect(await call('cancelAppointment', { id })).toMatchObject({
      appointment: { id, state: 'cancelled' },
    });
    expect(store.appointments()).toMatchObject([{ id, state: 'cancelled', time: '15:30' }]);

    expect(await call('removeAppointment', { id })).toEqual({ appointment: null });
    expect(store.appointments()).toEqual([]);
    expect(store.activity().map((record) => record.action)).toEqual([
      'added',
      'changed',
      'cancelled',
      'deleted',
    ]);
  });

  it('add a Series, change it from one Appointment on, and end it, answering with that one', async () => {
    const { store, call } = commands();
    const dialysis = {
      what: 'Dialysis',
      date: '2026-11-23',
      time: '09:00',
      repeat: { every: 'week', weekdays: [0, 3] },
      ends: '2026-12-31',
    };
    const id = '6a1f7c3e-2b4d-4e8f-9a0b-1c2d3e4f5a6b';
    const added = await call('addSeries', { id, details: JSON.stringify(dialysis) });
    expect(added).toMatchObject({ appointment: { date: '2026-11-23', series: { id } } });
    const [, , third, fourth] = store.appointments();
    expect(
      await call('changeSeries', { id: third.id, changes: JSON.stringify({ time: '10:00' }) }),
    ).toMatchObject({ appointment: { id: third.id, time: '10:00' } });
    expect(await call('endSeries', { id: fourth.id })).toMatchObject({
      appointment: { id: fourth.id, state: 'cancelled' },
    });
    expect(store.activity().map(({ action, seriesId }) => [action, Boolean(seriesId)])).toEqual([
      ['added', true],
      ['changed', true],
      ['cancelled', true],
    ]);
  });

  it('carry out once an add that the app sends twice with the same ID', async () => {
    const { store, call } = commands();
    const sent = { id: '3f0c8a52-9d1e-4b7a-8c11-5e2f6a7b8c9d', details: JSON.stringify(checkUp) };
    const first = await call('addAppointment', sent);
    expect(await call('addAppointment', sent)).toEqual(first);
    expect(store.appointments()).toMatchObject([{ id: sent.id, ...checkUp }]);
    expect(store.activity()).toHaveLength(1);
  });

  it("make and switch off the caller's own subscription link", async () => {
    const { store, call } = commands();
    const made = await call('makeSubscriptionLink', {});
    expect(made).toEqual({
      subscriptionLink: {
        secret: expect.stringMatching(/^[\w-]{43}$/),
        madeAt: expect.any(String),
      },
    });
    expect(store.subscriptionLinks()).toMatchObject([{ personId: 'person-linda' }]);
    expect(await call('switchOffSubscriptionLink', {})).toEqual({ subscriptionLink: null });
    expect(store.subscriptionLinks()).toEqual([]);
    expect(store.activity()).toEqual([]);
  });

  it("never touch another person's link, whatever was sent", async () => {
    const { store, call } = commands({ 'account-linda': 'Linda', 'account-mark': 'Mark' });
    const mark = { identity: { sub: 'person-mark', username: 'account-mark' } };
    await call('makeSubscriptionLink', {}, mark);
    await call('switchOffSubscriptionLink', { personId: 'person-mark', id: 'person-mark' });
    expect(store.subscriptionLinks()).toMatchObject([{ personId: 'person-mark' }]);
  });

  it('also take a mutation named the way AppSync names it, with arguments not as text', async () => {
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
    const { add, nameOf } = commands();
    const added = await add();
    expect(nameOf).toHaveBeenCalledWith('account-linda');
    expect(added.added).toMatchObject({
      personId: 'person-linda',
      personName: 'Linda',
      viaAgent: false,
    });
  });

  it('never comes from what the caller sent', async () => {
    const { add } = commands();
    const added = await add({
      ...checkUp,
      added: { personId: 'person-mark', personName: 'Mark', viaAgent: true, at: '2020-01-01' },
      personName: 'Mark',
      viaAgent: true,
    });
    expect(added.added).toEqual({
      personId: 'person-linda',
      personName: 'Linda',
      viaAgent: false,
      at: '2026-11-19T20:00:00.000Z',
    });
  });

  it('is "Someone" when the account has no name', async () => {
    const { add } = commands({ 'account-linda': '   ' });
    expect((await add()).added.personName).toBe('Someone');
  });

  it.each([
    null,
    undefined,
    {},
    { sub: 'person-linda' },
    { username: 'account-linda' },
    { sub: '', username: '' },
  ])('fails unless a person is signed in (%j)', async (identity) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, call } = commands();
    await expect(
      call('addAppointment', { details: JSON.stringify(checkUp) }, { identity }),
    ).rejects.toThrow(/Could not save/);
    expect(store.appointments()).toEqual([]);
  });
});

describe('when a command cannot be carried out', () => {
  it("a refusal is the answer, in the core's own words", async () => {
    const { store, call, add } = commands();
    expect(
      await call('addAppointment', { details: JSON.stringify({ ...checkUp, what: '' }) }),
    ).toEqual({
      refusal: { reason: 'invalid', message: 'Say what the Appointment is.', detail: 'what' },
    });
    expect(await call('addAppointment', { details: 'not json' })).toMatchObject({
      refusal: { reason: 'invalid' },
    });
    expect(await call('cancelAppointment', { id: 'no-such-appointment' })).toMatchObject({
      refusal: { reason: 'missing' },
    });
    const { id } = await add();
    store.noteTextSentAbout(id);
    expect(await call('removeAppointment', { id })).toMatchObject({
      refusal: { reason: 'texted', message: expect.stringMatching(/Cancel it instead/) },
    });
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
