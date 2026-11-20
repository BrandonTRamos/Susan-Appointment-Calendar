import { describe, expect, it, vi } from 'vitest';
import {
  CalendarRefusal,
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  createMemoryStore,
  NO_ADMIN_MESSENGER,
  overlappingAppointments,
  pastAppointments,
  upcomingAppointments,
  type Actor,
  type NewAppointment,
} from './index';

const EASTERN = 'America/New_York';

const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };
const mark: Actor = { person: { id: 'person-mark', name: 'Mark' }, viaAgent: false };
/** The one account that is not an Admin's. The core is never told which account that is. */
const susan: Actor = { person: { id: 'person-susan', name: 'Susan' }, viaAgent: false };
const lindasAgent: Actor = { person: linda.person, viaAgent: true };
const ann: Actor = { person: { id: 'person-ann', name: 'Ann' }, viaAgent: false };
/** Every Admin. Susan is not one of them. */
const ADMINS = [linda, mark, ann].map((admin) => admin.person.id);

const checkUp: NewAppointment = { what: 'Cardiology check-up', date: '2026-11-20', time: '14:00' };
const everyDetail: NewAppointment = {
  ...checkUp,
  withWhom: 'Dr. Patel',
  placeName: 'Heart Clinic',
  placeAddress: '400 Main St',
  driverName: 'Linda',
  pickupTime: '13:15',
  noteForSusan: 'Bring your list of medicines.',
  privateNotes: 'Ask about the new prescription.',
};

/** A calendar on a Thursday afternoon in November, Susan's time: 19 November 2026, 3:00 pm. */
function calendar(timeZone = EASTERN) {
  const store = createMemoryStore();
  const clock = createFixedClock('2026-11-19T20:00:00.000Z');
  const messenger = createMemoryMessenger(ADMINS);
  return {
    store,
    clock,
    messenger,
    core: createCalendarCore({ store, clock, messenger, timeZone }),
  };
}

/** Expects the command to be refused for `reason`, with words a person can read. */
async function refused(command: Promise<unknown>, reason: CalendarRefusal['reason']) {
  const error = await command.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(CalendarRefusal);
  expect((error as CalendarRefusal).reason).toBe(reason);
  expect((error as CalendarRefusal).message).toMatch(/\w+ \w+/);
  return error as CalendarRefusal;
}

describe('adding an Appointment', () => {
  it('needs only what it is, its date and its start time', async () => {
    const { core, store } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    expect(store.appointments()).toEqual([added]);
    expect(added).toMatchObject({
      what: 'Cardiology check-up',
      date: '2026-11-20',
      time: '14:00',
      state: 'active',
      withWhom: null,
      placeName: null,
      placeAddress: null,
      driverName: null,
      pickupTime: null,
      noteForSusan: null,
      privateNotes: null,
    });
  });

  it('holds who it is with, where, the Driver and pickup time, and both kinds of note', async () => {
    const { core, store } = calendar();
    await core.addAppointment(linda, everyDetail);
    expect(store.appointments()[0]).toMatchObject(everyDetail);
  });

  it('has no end time, category or attachment, even when one is sent', async () => {
    const { core, store } = calendar();
    const sent = { ...checkUp, endTime: '15:00', category: 'medical', attachment: 'referral.pdf' };
    await core.addAppointment(linda, sent);
    const [kept] = store.appointments();
    expect(kept).not.toHaveProperty('endTime');
    expect(kept).not.toHaveProperty('category');
    expect(kept).not.toHaveProperty('attachment');
  });

  it('tidies the words: no stray spaces, and an empty detail is no detail', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      what: '  Cardiology check-up ',
      withWhom: '   ',
      placeName: '',
      noteForSusan: ' Bring your list. ',
    });
    expect(added).toMatchObject({
      what: 'Cardiology check-up',
      withWhom: null,
      placeName: null,
      noteForSusan: 'Bring your list.',
    });
  });

  it('drops characters nobody can see, and does not take them for a name', async () => {
    const { core, store } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      what: 'Eye\u200b exam\u0000',
      noteForSusan: 'Bring your glasses.\r\nAnd the\tletter.',
    });
    expect(added.what).toBe('Eye exam');
    expect(added.noteForSusan).toBe('Bring your glasses.\nAnd the letter.');
    await refused(
      core.addAppointment(linda, { ...checkUp, what: '\u200b\u0000 \ufeff' }),
      'invalid',
    );
    expect(store.appointments()).toEqual([added]);
  });

  it.each([
    ['what it is', { ...checkUp, what: '   ' }, 'what'],
    ['what it is at all', { date: '2026-11-20', time: '14:00' }, 'what'],
    ['a date', { ...checkUp, date: '' }, 'date'],
    ['a real date', { ...checkUp, date: '2026-02-30' }, 'date'],
    ['a date in this century', { ...checkUp, date: '0026-11-20' }, 'date'],
    ['a start time', { ...checkUp, time: null }, 'time'],
    ['a real start time', { ...checkUp, time: '25:00' }, 'time'],
    ['a real pickup time', { ...checkUp, pickupTime: 'noon' }, 'pickupTime'],
    ['words where words belong', { ...checkUp, withWhom: 42 }, 'withWhom'],
    ['what it is in a few words', { ...checkUp, what: 'x'.repeat(500) }, 'what'],
  ])('is refused without %s, and nothing is kept', async (_missing, details, detail) => {
    const { core, store } = calendar();
    const refusal = await refused(
      core.addAppointment(linda, details as unknown as NewAppointment),
      'invalid',
    );
    expect(refusal.detail).toBe(detail);
    expect(store.appointments()).toEqual([]);
    expect(store.activity()).toEqual([]);
  });

  it('is refused when what was sent is not details at all', async () => {
    const { core } = calendar();
    await refused(core.addAppointment(linda, 'Dentist' as unknown as NewAppointment), 'invalid');
    await refused(core.addAppointment(linda, null as unknown as NewAppointment), 'invalid');
  });
});

describe('an add that arrives twice', () => {
  // A phone that loses the answer sends the command again. Whoever sends an add can give the new
  // Appointment its ID, so that the second arrival is known for what it is.
  const id = '3f0c8a52-9d1e-4b7a-8c11-5e2f6a7b8c9d';

  it('is carried out once', async () => {
    const { core, store, clock } = calendar();
    const first = await core.addAppointment(linda, everyDetail, id);
    clock.set('2026-11-19T20:00:05.000Z');
    const second = await core.addAppointment(linda, everyDetail, id);
    expect(first.id).toBe(id);
    expect(second).toEqual(first);
    expect(store.appointments()).toEqual([first]);
    expect(store.activity()).toHaveLength(1);
  });

  it('is refused when it is not the same add: other details, or another person', async () => {
    const { core, store } = calendar();
    const first = await core.addAppointment(linda, checkUp, id);
    const refusal = await refused(
      core.addAppointment(linda, { ...checkUp, time: '15:30' }, id),
      'invalid',
    );
    expect(refusal.message).toMatch(/already been saved/);
    await refused(core.addAppointment(mark, checkUp, id), 'invalid');
    expect(store.appointments()).toEqual([first]);
    expect(store.activity()).toHaveLength(1);
  });

  it('is refused with an ID that is not one', async () => {
    const { core, store } = calendar();
    await refused(core.addAppointment(linda, checkUp, 'dentist'), 'invalid');
    await refused(core.addAppointment(linda, checkUp, 42 as unknown as string), 'invalid');
    expect(store.appointments()).toEqual([]);
  });
});

describe('changing an Appointment', () => {
  it('changes the details given and leaves the rest as they were', async () => {
    const { core, store } = calendar();
    const { id } = await core.addAppointment(linda, everyDetail);
    const changed = await core.changeAppointment(mark, id, { time: '15:30', driverName: 'Mark' });
    expect(changed).toMatchObject({ ...everyDetail, time: '15:30', driverName: 'Mark' });
    expect(store.appointments()).toEqual([changed]);
  });

  it('can change every detail', async () => {
    const { core, store } = calendar();
    const { id } = await core.addAppointment(linda, everyDetail);
    const next = {
      what: 'Eye exam',
      date: '2026-12-01',
      time: '15:30',
      withWhom: 'Dr. Chen',
      placeName: 'Vision Center',
      placeAddress: '12 Oak Ave',
      driverName: 'Mark',
      pickupTime: '14:45',
      noteForSusan: 'Bring your glasses.',
      privateNotes: 'Insurance card is in the blue folder.',
    };
    await core.changeAppointment(mark, id, next);
    expect(store.appointments()[0]).toMatchObject(next);
  });

  it('clears a detail that is sent as empty', async () => {
    const { core } = calendar();
    const { id } = await core.addAppointment(linda, everyDetail);
    const changed = await core.changeAppointment(linda, id, { driverName: null, pickupTime: '' });
    expect(changed).toMatchObject({ driverName: null, pickupTime: null, withWhom: 'Dr. Patel' });
  });

  it('does nothing when it would leave the Appointment as it is: nobody changed it', async () => {
    const { core, store, clock } = calendar();
    const added = await core.addAppointment(linda, everyDetail);
    clock.set('2026-11-19T21:00:00.000Z');
    expect(await core.changeAppointment(mark, added.id, {})).toEqual(added);
    expect(
      await core.changeAppointment(mark, added.id, { time: '14:00', withWhom: ' Dr. Patel ' }),
    ).toEqual(added);
    expect(store.appointments()).toEqual([added]);
    expect(store.activity()).toHaveLength(1);
  });

  it('is refused when it would leave no what, date or start time', async () => {
    const { core, store } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    await refused(core.changeAppointment(mark, added.id, { what: '' }), 'invalid');
    await refused(core.changeAppointment(mark, added.id, { date: '2026-11-31' }), 'invalid');
    await refused(
      core.changeAppointment(mark, added.id, { time: null as unknown as string }),
      'invalid',
    );
    expect(store.appointments()).toEqual([added]);
  });

  it('is refused for an Appointment the calendar does not have', async () => {
    const { core } = calendar();
    await refused(
      core.changeAppointment(linda, 'no-such-appointment', { time: '15:30' }),
      'missing',
    );
  });

  it('is refused once the Appointment is cancelled', async () => {
    const { core, store } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    const cancelled = await core.cancelAppointment(linda, id);
    await refused(core.changeAppointment(mark, id, { time: '15:30' }), 'cancelled');
    expect(store.appointments()).toEqual([cancelled]);
  });
});

describe('cancelling an Appointment', () => {
  it('keeps it in the calendar, marked cancelled, with every detail', async () => {
    const { core, store } = calendar();
    const { id } = await core.addAppointment(linda, everyDetail);
    const cancelled = await core.cancelAppointment(mark, id);
    expect(cancelled).toMatchObject({ ...everyDetail, id, state: 'cancelled' });
    expect(store.appointments()).toEqual([cancelled]);
  });

  it('is refused the second time, and for an Appointment the calendar does not have', async () => {
    const { core } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    await core.cancelAppointment(linda, id);
    await refused(core.cancelAppointment(mark, id), 'cancelled');
    await refused(core.cancelAppointment(mark, 'no-such-appointment'), 'missing');
  });
});

describe('deleting an Appointment entered by mistake', () => {
  it('removes it from the calendar', async () => {
    const { core, store } = calendar();
    const kept = await core.addAppointment(linda, checkUp);
    const mistake = await core.addAppointment(linda, { ...checkUp, what: 'Wrong day' });
    await core.deleteAppointment(linda, mistake.id);
    expect(store.appointments()).toEqual([kept]);
  });

  it('is refused once any text about it has gone to Susan', async () => {
    const { core, store } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    store.noteTextSentAbout(added.id);
    const refusal = await refused(core.deleteAppointment(linda, added.id), 'texted');
    expect(refusal.message).toMatch(/Cancel it instead/);
    expect(store.appointments()).toEqual([added]);
  });

  it('is still allowed for another Appointment she has not been texted about', async () => {
    const { core, store } = calendar();
    const texted = await core.addAppointment(linda, checkUp);
    const mistake = await core.addAppointment(linda, { ...checkUp, what: 'Wrong day' });
    store.noteTextSentAbout(texted.id);
    await core.deleteAppointment(mark, mistake.id);
    expect(store.appointments()).toEqual([texted]);
  });

  it('removes a cancelled Appointment too, unless she was texted about it', async () => {
    const { core, store } = calendar();
    const first = await core.addAppointment(linda, checkUp);
    const second = await core.addAppointment(linda, { ...checkUp, what: 'Blood draw' });
    await core.cancelAppointment(linda, first.id);
    await core.cancelAppointment(linda, second.id);
    store.noteTextSentAbout(second.id);
    await core.deleteAppointment(linda, first.id);
    await refused(core.deleteAppointment(linda, second.id), 'texted');
    expect(store.appointments().map((appointment) => appointment.what)).toEqual(['Blood draw']);
  });

  it('is refused for an Appointment the calendar does not have', async () => {
    const { core } = calendar();
    await refused(core.deleteAppointment(linda, 'no-such-appointment'), 'missing');
  });
});

describe('who added an Appointment and who last changed it', () => {
  it('stamps the person who added it and when; nobody has changed it yet', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    expect(added.added).toEqual({
      personId: 'person-linda',
      personName: 'Linda',
      viaAgent: false,
      at: '2026-11-19T20:00:00.000Z',
    });
    expect(added.lastChanged).toBeNull();
  });

  it('stamps the person who last changed it and when, and keeps who added it', async () => {
    const { core, clock } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    clock.set('2026-11-19T21:30:00.000Z');
    await core.changeAppointment(mark, added.id, { time: '15:30' });
    clock.set('2026-11-20T13:00:00.000Z');
    const changed = await core.changeAppointment(susan, added.id, { driverName: 'Mark' });
    expect(changed.added).toEqual(added.added);
    expect(changed.lastChanged).toEqual({
      personId: 'person-susan',
      personName: 'Susan',
      viaAgent: false,
      at: '2026-11-20T13:00:00.000Z',
    });
  });

  it('counts cancelling as the last change', async () => {
    const { core, clock } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    clock.set('2026-11-19T22:00:00.000Z');
    const cancelled = await core.cancelAppointment(mark, added.id);
    expect(cancelled.added).toEqual(added.added);
    expect(cancelled.lastChanged).toMatchObject({
      personName: 'Mark',
      at: '2026-11-19T22:00:00.000Z',
    });
  });

  it('says so when the person acted through their agent', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(lindasAgent, checkUp);
    expect(added.added).toMatchObject({ personName: 'Linda', viaAgent: true });
    const changed = await core.changeAppointment(linda, added.id, { time: '15:30' });
    expect(changed.added.viaAgent).toBe(true);
    expect(changed.lastChanged).toMatchObject({ personName: 'Linda', viaAgent: false });
  });
});

describe('activity records', () => {
  it('each command leaves exactly one: who did what to which Appointment', async () => {
    const { core, store, clock } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    expect(store.activity()).toHaveLength(1);
    clock.set('2026-11-19T21:00:00.000Z');
    await core.changeAppointment(mark, id, { time: '15:30' });
    expect(store.activity()).toHaveLength(2);
    clock.set('2026-11-19T22:00:00.000Z');
    await core.cancelAppointment(susan, id);
    expect(store.activity()).toHaveLength(3);
    clock.set('2026-11-19T23:00:00.000Z');
    await core.deleteAppointment(linda, id);

    const about = { appointmentId: id, what: 'Cardiology check-up', date: '2026-11-20' };
    expect(store.activity()).toMatchObject([
      { action: 'added', personName: 'Linda', at: '2026-11-19T20:00:00.000Z', ...about },
      { action: 'changed', personName: 'Mark', at: '2026-11-19T21:00:00.000Z', ...about },
      { action: 'cancelled', personName: 'Susan', at: '2026-11-19T22:00:00.000Z', ...about },
      { action: 'deleted', personName: 'Linda', at: '2026-11-19T23:00:00.000Z', ...about },
    ]);
    expect(store.activity().map((record) => record.time)).toEqual([
      '14:00',
      '15:30',
      '15:30',
      '15:30',
    ]);
    expect(new Set(store.activity().map((record) => record.id)).size).toBe(4);
  });

  it('says whether the person acted through an agent', async () => {
    const { core, store } = calendar();
    const { id } = await core.addAppointment(lindasAgent, checkUp);
    await core.changeAppointment(linda, id, { time: '15:30' });
    await core.cancelAppointment(lindasAgent, id);
    expect(store.activity()).toMatchObject([
      { action: 'added', personId: 'person-linda', viaAgent: true },
      { action: 'changed', personId: 'person-linda', viaAgent: false },
      { action: 'cancelled', personId: 'person-linda', viaAgent: true },
    ]);
  });

  it('a refused command leaves none', async () => {
    const { core, store } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    store.noteTextSentAbout(id);
    await refused(core.changeAppointment(mark, id, { what: '' }), 'invalid');
    await refused(core.deleteAppointment(mark, id), 'texted');
    await refused(core.cancelAppointment(mark, 'no-such-appointment'), 'missing');
    expect(store.activity()).toHaveLength(1);
  });
});

describe('Activity updates', () => {
  /** Who was told, and in what words, for every app notification sent so far. */
  const told = (messenger: ReturnType<typeof calendar>['messenger']) =>
    messenger.appNotifications().map(({ to, notification }) => ({ to, ...notification }));

  it('tell the other Admins, by app notification, who added an Appointment and when it is', async () => {
    const { core, messenger } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    expect(told(messenger)).toEqual([
      {
        to: ['person-mark', 'person-ann'],
        title: "Susan's Calendar",
        body: 'Linda added Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm.',
        opens: `/appointments/${id}`,
        tag: `appointment-${id}`,
      },
    ]);
  });

  it('say what changed, and the time it was before when it moved', async () => {
    const { core, messenger } = calendar();
    const { id } = await core.addAppointment(linda, everyDetail);
    await core.changeAppointment(mark, id, { time: '15:30', driverName: 'Ann', placeName: null });
    expect(told(messenger)[1]).toMatchObject({
      to: ['person-linda', 'person-ann'],
      body:
        'Mark changed Cardiology check-up, Fri, Nov 20, 2026 at 3:30 pm: ' +
        "the start time (was 2:00 pm), the place's name and the Driver's name.",
      opens: `/appointments/${id}`,
    });

    await core.changeAppointment(ann, id, { date: '2026-11-23', what: 'Heart check-up' });
    expect(told(messenger)[2]).toMatchObject({
      to: ['person-linda', 'person-mark'],
      body:
        'Ann changed Heart check-up, Mon, Nov 23, 2026 at 3:30 pm: ' +
        'what it is (was Cardiology check-up) and the date (was Fri, Nov 20, 2026).',
    });

    await core.changeAppointment(linda, id, { privateNotes: 'Ask about the new dose.' });
    expect(told(messenger)[3]).toMatchObject({
      to: ['person-mark', 'person-ann'],
      body: 'Linda changed Heart check-up, Mon, Nov 23, 2026 at 3:30 pm: the Private notes.',
    });
  });

  it('say who cancelled an Appointment', async () => {
    const { core, messenger } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    await core.cancelAppointment(mark, id);
    expect(told(messenger)[1]).toMatchObject({
      to: ['person-linda', 'person-ann'],
      body: 'Mark cancelled Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm.',
      opens: `/appointments/${id}`,
    });
  });

  it('never tell the person who made the change what they just did', async () => {
    const { core, messenger } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    await core.changeAppointment(linda, id, { time: '15:30' });
    await core.cancelAppointment(linda, id);
    expect(messenger.appNotifications().flatMap(({ to }) => to)).not.toContain('person-linda');
    expect(messenger.appNotifications()).toHaveLength(3);
  });

  it('go to nobody when the only Admin made the change', async () => {
    const store = createMemoryStore();
    const messenger = createMemoryMessenger(['person-linda']);
    const clock = createFixedClock('2026-11-19T20:00:00.000Z');
    const core = createCalendarCore({ store, clock, messenger, timeZone: EASTERN });
    await core.addAppointment(linda, checkUp);
    expect(messenger.appNotifications()).toEqual([]);
  });

  it("through an agent, name the agent's owner and do not tell them", async () => {
    const { core, messenger } = calendar();
    const { id } = await core.addAppointment(lindasAgent, checkUp);
    await core.changeAppointment(lindasAgent, id, { time: '15:30' });
    await core.cancelAppointment(lindasAgent, id);
    expect(told(messenger)).toMatchObject([
      { to: ['person-mark', 'person-ann'], body: expect.stringMatching(/^Linda's agent added /) },
      { to: ['person-mark', 'person-ann'], body: expect.stringMatching(/^Linda's agent changed /) },
      {
        to: ['person-mark', 'person-ann'],
        body: expect.stringMatching(/^Linda's agent cancelled /),
      },
    ]);
  });

  it('never go to Susan, and tell every Admin when she makes the change', async () => {
    const { core, messenger } = calendar();
    const { id } = await core.addAppointment(susan, checkUp);
    await core.changeAppointment(linda, id, { time: '15:30' });
    await core.cancelAppointment(susan, id);
    expect(told(messenger)).toMatchObject([
      {
        to: ['person-linda', 'person-mark', 'person-ann'],
        body: expect.stringMatching(/^Susan added /),
      },
      { to: ['person-mark', 'person-ann'] },
      { to: ['person-linda', 'person-mark', 'person-ann'] },
    ]);
    expect(messenger.appNotifications().flatMap(({ to }) => to)).not.toContain('person-susan');
  });

  it('are one per command, however many details it changes', async () => {
    const { core, messenger } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    await core.changeAppointment(mark, id, {
      ...everyDetail,
      what: 'Heart check-up',
      time: '09:00',
      date: '2026-11-21',
    });
    expect(messenger.appNotifications()).toHaveLength(2);
  });

  it('are not sent for a command that changes nothing, is refused, or arrives twice', async () => {
    const { core, store, messenger } = calendar();
    const sentId = '3f0c8a52-9d1e-4b7a-8c11-5e2f6a7b8c9d';
    await core.addAppointment(linda, checkUp, sentId);
    await core.addAppointment(linda, checkUp, sentId);
    await core.changeAppointment(mark, sentId, { time: '14:00' });
    await refused(core.changeAppointment(mark, sentId, { what: '' }), 'invalid');
    await core.cancelAppointment(mark, sentId);
    await refused(core.cancelAppointment(mark, sentId), 'cancelled');
    store.noteTextSentAbout(sentId);
    await refused(core.deleteAppointment(mark, sentId), 'texted');
    expect(messenger.appNotifications().map(({ notification }) => notification.body)).toEqual([
      expect.stringMatching(/^Linda added /),
      expect.stringMatching(/^Mark cancelled /),
    ]);
  });

  it('are not sent for deleting an Appointment entered by mistake', async () => {
    const { core, messenger } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    await core.deleteAppointment(mark, id);
    expect(messenger.appNotifications()).toHaveLength(1);
  });

  it('are never sent by a calendar that only reads, such as the subscription feed', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createMemoryStore();
    const clock = createFixedClock('2026-11-19T20:00:00.000Z');
    const core = createCalendarCore({
      store,
      clock,
      messenger: NO_ADMIN_MESSENGER,
      timeZone: EASTERN,
    });
    await core.addAppointment(linda, checkUp);
    // It knows no Admins, so it never even tries.
    expect(await NO_ADMIN_MESSENGER.admins()).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('that cannot be sent leave the change made', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { core, store, messenger } = calendar();
    messenger.fail(true);
    const added = await core.addAppointment(linda, checkUp);
    const changed = await core.changeAppointment(mark, added.id, { time: '15:30' });
    expect(changed.time).toBe('15:30');
    expect(store.appointments()).toMatchObject([{ id: added.id, time: '15:30' }]);
    expect(store.activity()).toHaveLength(2);
    expect(messenger.appNotifications()).toEqual([]);
    // What broke, and nothing about the Appointment.
    expect(logged).toHaveBeenCalled();
    expect(logged.mock.calls.flat().join(' ')).not.toContain('Cardiology');
    logged.mockRestore();
  });
});

describe('Susan and the Admins', () => {
  it('have the same rights: Susan can add, change, cancel and delete like anyone else', async () => {
    const { core, store } = calendar();
    const hers = await core.addAppointment(susan, { ...checkUp, what: 'Hair' });
    const lindas = await core.addAppointment(linda, checkUp);
    await core.changeAppointment(susan, lindas.id, { time: '15:30' });
    await core.cancelAppointment(susan, lindas.id);
    await core.deleteAppointment(susan, lindas.id);
    await core.changeAppointment(mark, hers.id, { time: '11:00' });
    expect(store.appointments()).toMatchObject([{ what: 'Hair', time: '11:00' }]);
    expect(store.activity().map((record) => record.personName)).toEqual([
      'Susan',
      'Linda',
      'Susan',
      'Susan',
      'Susan',
      'Mark',
    ]);
  });
});

describe("every date and time means Susan's local time", () => {
  it('whatever time zone the machine is in', async () => {
    // vite.config.ts runs the tests in Pacific/Auckland, where 2:00 pm is a different moment.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe(EASTERN);
    const { core } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    expect(added).toMatchObject({ date: '2026-11-20', time: '14:00' });
    expect(added.startsAt).toBe('2026-11-20T19:00:00.000Z');
  });

  it('in the time zone the calendar is configured with', async () => {
    const central = calendar('America/Chicago');
    const added = await central.core.addAppointment(linda, checkUp);
    expect(added.startsAt).toBe('2026-11-20T20:00:00.000Z');
  });

  it('on both sides of the clocks going forward', async () => {
    // US Eastern clocks go forward on Sunday 14 March 2027.
    const { core } = calendar();
    const saturday = await core.addAppointment(linda, { ...checkUp, date: '2027-03-13' });
    const monday = await core.addAppointment(linda, { ...checkUp, date: '2027-03-15' });
    expect(saturday.startsAt).toBe('2027-03-13T19:00:00.000Z');
    expect(monday.startsAt).toBe('2027-03-15T18:00:00.000Z');
  });

  it('on both sides of the clocks going back', async () => {
    // US Eastern clocks go back on Sunday 1 November 2026.
    const { core } = calendar();
    const saturday = await core.addAppointment(linda, { ...checkUp, date: '2026-10-31' });
    const monday = await core.addAppointment(linda, { ...checkUp, date: '2026-11-02' });
    expect(saturday.startsAt).toBe('2026-10-31T18:00:00.000Z');
    expect(monday.startsAt).toBe('2026-11-02T19:00:00.000Z');
  });

  it('keeps the same clock time when an Appointment moves across a clock change', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, { ...checkUp, date: '2027-03-12' });
    expect(added.startsAt).toBe('2027-03-12T19:00:00.000Z');
    const moved = await core.changeAppointment(mark, added.id, { date: '2027-03-16' });
    expect(moved).toMatchObject({ date: '2027-03-16', time: '14:00' });
    expect(moved.startsAt).toBe('2027-03-16T18:00:00.000Z');
  });

  it('refuses a start time the clocks skip that night, and says why', async () => {
    const { core, store } = calendar();
    const refusal = await refused(
      core.addAppointment(linda, { ...checkUp, date: '2027-03-14', time: '02:30' }),
      'invalid',
    );
    expect(refusal.detail).toBe('time');
    expect(refusal.message).toMatch(/2:30 am/);
    expect(refusal.message).toMatch(/clocks go forward/);
    expect(store.appointments()).toEqual([]);
  });

  it('takes the first 1:30 am on the night the clocks repeat an hour', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      date: '2026-11-01',
      time: '01:30',
    });
    expect(added.startsAt).toBe('2026-11-01T05:30:00.000Z');
  });
});

describe('upcoming Appointments', () => {
  it('are those dated today or later, in the order they happen', async () => {
    const { core, store } = calendar();
    await core.addAppointment(linda, { ...checkUp, what: 'Eye exam', date: '2026-12-01' });
    await core.addAppointment(linda, { ...checkUp, what: 'Blood draw', date: '2026-11-23' });
    await core.addAppointment(linda, {
      ...checkUp,
      what: 'Hair',
      date: '2026-11-23',
      time: '09:00',
    });
    await core.addAppointment(linda, { ...checkUp, what: 'Flu shot', date: '2026-11-18' });
    await core.addAppointment(linda, {
      ...checkUp,
      what: 'Breakfast',
      date: '2026-11-19',
      time: '08:00',
    });
    expect(upcomingAppointments(store.appointments(), '2026-11-19').map((a) => a.what)).toEqual([
      'Breakfast',
      'Hair',
      'Blood draw',
      'Eye exam',
    ]);
  });

  it('leave out cancelled ones', async () => {
    const { core, store } = calendar();
    const hair = await core.addAppointment(linda, { ...checkUp, what: 'Hair' });
    await core.addAppointment(linda, { ...checkUp, what: 'Eye exam', date: '2026-12-01' });
    await core.cancelAppointment(mark, hair.id);
    expect(upcomingAppointments(store.appointments(), '2026-11-19').map((a) => a.what)).toEqual([
      'Eye exam',
    ]);
  });
});

describe('past Appointments', () => {
  it('are those dated before today, newest first, cancelled ones included', async () => {
    const { core, store } = calendar();
    await core.addAppointment(linda, { ...checkUp, what: 'Flu shot', date: '2026-10-02' });
    const dentist = await core.addAppointment(linda, {
      ...checkUp,
      what: 'Dentist',
      date: '2026-11-18',
      time: '09:00',
    });
    await core.addAppointment(linda, { ...checkUp, what: 'Hair', date: '2026-11-18' });
    await core.addAppointment(linda, { ...checkUp, what: 'Last year', date: '2025-12-30' });
    await core.addAppointment(linda, {
      ...checkUp,
      what: 'Breakfast',
      date: '2026-11-19',
      time: '08:00',
    });
    await core.addAppointment(linda, { ...checkUp, what: 'Eye exam', date: '2026-12-01' });
    await core.cancelAppointment(mark, dentist.id);
    const past = pastAppointments(store.appointments(), '2026-11-19');
    expect(past.map((a) => [a.what, a.state])).toEqual([
      ['Hair', 'active'],
      ['Dentist', 'cancelled'],
      ['Flu shot', 'active'],
      ['Last year', 'active'],
    ]);
  });
});

describe('overlapping Appointments', () => {
  /** What the Appointments that overlap `id` are, taking each to be about an hour long. */
  const overlapping = (store: ReturnType<typeof calendar>['store'], id: string) =>
    overlappingAppointments(
      store.appointments().find((a) => a.id === id)!,
      store.appointments(),
    ).map((a) => a.what);

  it('are the others starting less than an hour before or after it', async () => {
    const { core, store } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    await core.addAppointment(mark, { ...checkUp, what: 'Blood draw', time: '13:01' });
    await core.addAppointment(mark, { ...checkUp, what: 'Hair', time: '14:59' });
    await core.addAppointment(mark, { ...checkUp, what: 'Lunch', time: '13:00' });
    await core.addAppointment(mark, { ...checkUp, what: 'Eye exam', time: '15:00' });
    await core.addAppointment(mark, { ...checkUp, what: 'Dentist', date: '2026-11-21' });
    expect(overlapping(store, added.id)).toEqual(['Blood draw', 'Hair']);
  });

  it('include one on the next day, just after midnight', async () => {
    const { core, store } = calendar();
    const late = await core.addAppointment(linda, { ...checkUp, what: 'Late call', time: '23:30' });
    await core.addAppointment(mark, {
      ...checkUp,
      what: 'Early call',
      date: '2026-11-21',
      time: '00:15',
    });
    expect(overlapping(store, late.id)).toEqual(['Early call']);
  });

  it('include one at the very same time', async () => {
    const { core, store } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    await core.addAppointment(mark, { ...checkUp, what: 'Hair' });
    expect(overlapping(store, added.id)).toEqual(['Hair']);
  });

  it('leave out cancelled ones, and a cancelled one overlaps nothing', async () => {
    const { core, store } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    const hair = await core.addAppointment(mark, { ...checkUp, what: 'Hair' });
    await core.cancelAppointment(mark, hair.id);
    expect(overlapping(store, added.id)).toEqual([]);
    expect(overlapping(store, hair.id)).toEqual([]);
  });

  it('are measured in real time across a clock change', async () => {
    const { core, store } = calendar();
    // The clocks go back at 2:00 am on 1 November 2026: 1:30 am happens an hour after 12:30 am,
    // then again an hour later. The first one is meant, so 12:45 am is within the hour.
    const early = await core.addAppointment(linda, {
      ...checkUp,
      what: 'Night nurse',
      date: '2026-11-01',
      time: '01:30',
    });
    await core.addAppointment(mark, {
      ...checkUp,
      what: 'Pill',
      date: '2026-11-01',
      time: '00:45',
    });
    await core.addAppointment(mark, {
      ...checkUp,
      what: 'Wake',
      date: '2026-11-01',
      time: '02:15',
    });
    expect(overlapping(store, early.id)).toEqual(['Pill']);
  });
});

/** A feed read back: each event's properties, unfolded and unescaped. */
function events(feed: string) {
  const lines = feed.replace(/\r\n[ \t]/g, '').split('\r\n');
  const found: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT' && current) {
      found.push(current);
      current = null;
    } else if (current) {
      const colon = line.indexOf(':');
      current[line.slice(0, colon)] = line
        .slice(colon + 1)
        .replace(/\\n/g, '\n')
        .replace(/\\([;,])/g, '$1');
    }
  }
  return found;
}

/** What a subscriber's calendar shows for each event: what it is, and when, in their own zone. */
function seenIn(zone: string, feed: string) {
  const at = (value: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(
      new Date(
        value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'),
      ),
    );
  return events(feed).map((each) => `${each.SUMMARY}: ${at(each.DTSTART)} to ${at(each.DTEND)}`);
}

describe('calendar subscription', () => {
  it('a link shows every active Appointment, with what, who with, where, Driver and Note', async () => {
    const { core } = calendar();
    await core.addAppointment(linda, everyDetail);
    await core.addAppointment(mark, { what: 'Blood draw', date: '2026-11-25', time: '09:00' });
    const { secret } = await core.makeSubscriptionLink(linda);

    const feed = await core.subscriptionFeed(secret);
    expect(feed).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/);
    expect(feed).toMatch(/END:VCALENDAR\r\n$/);
    expect(feed).toContain("X-WR-CALNAME:Susan's Calendar");
    expect(events(feed!)).toEqual([
      expect.objectContaining({
        SUMMARY: 'Cardiology check-up',
        LOCATION: 'Heart Clinic, 400 Main St',
        DESCRIPTION:
          'With Dr. Patel\nDriver: Linda, picking Susan up at 1:15 pm\nNote for Susan: Bring your list of medicines.',
        DTSTART: '20261120T190000Z',
      }),
      expect.objectContaining({ SUMMARY: 'Blood draw', DTSTART: '20261125T140000Z' }),
    ]);
    expect(events(feed!)[1]).not.toHaveProperty('LOCATION');
    expect(events(feed!)[1]).not.toHaveProperty('DESCRIPTION');
  });

  it('shows each Appointment as one hour long, since it has no end time', async () => {
    const { core } = calendar();
    await core.addAppointment(linda, { ...checkUp, time: '23:30' });
    const feed = await core.subscriptionFeed((await core.makeSubscriptionLink(linda)).secret);
    expect(events(feed!)[0]).toMatchObject({
      DTSTART: '20261121T043000Z',
      DTEND: '20261121T053000Z',
    });
  });

  it('leaves out Private notes and cancelled Appointments', async () => {
    const { core } = calendar();
    await core.addAppointment(linda, everyDetail);
    const off = await core.addAppointment(linda, { ...checkUp, what: 'Hair', date: '2026-11-21' });
    await core.cancelAppointment(mark, off.id);
    const feed = await core.subscriptionFeed((await core.makeSubscriptionLink(linda)).secret);
    expect(events(feed!).map((each) => each.SUMMARY)).toEqual(['Cardiology check-up']);
    expect(feed).not.toContain('prescription');
    expect(feed).not.toContain('Hair');
  });

  it("shows the right time whatever the subscriber's time zone, across a clock change", async () => {
    const { core } = calendar();
    // The clocks go back in US Eastern early on Sunday 1 November 2026.
    await core.addAppointment(linda, { what: 'Before', date: '2026-10-31', time: '14:00' });
    await core.addAppointment(linda, { what: 'After', date: '2026-11-01', time: '14:00' });
    const feed = (await core.subscriptionFeed((await core.makeSubscriptionLink(linda)).secret))!;
    expect(seenIn(EASTERN, feed)).toEqual([
      'Before: 31 Oct 2026, 14:00 to 31 Oct 2026, 15:00',
      'After: 1 Nov 2026, 14:00 to 1 Nov 2026, 15:00',
    ]);
    // The same moments, for someone in London, whose clocks went back a week earlier.
    expect(seenIn('Europe/London', feed)).toEqual([
      'Before: 31 Oct 2026, 18:00 to 31 Oct 2026, 19:00',
      'After: 1 Nov 2026, 19:00 to 1 Nov 2026, 20:00',
    ]);
  });

  it('shows changes made in the calendar the next time it is read', async () => {
    const { core } = calendar();
    const { secret } = await core.makeSubscriptionLink(linda);
    expect(events((await core.subscriptionFeed(secret))!)).toEqual([]);
    const added = await core.addAppointment(mark, checkUp);
    expect(events((await core.subscriptionFeed(secret))!)).toMatchObject([
      { DTSTART: '20261120T190000Z' },
    ]);
    await core.changeAppointment(mark, added.id, { time: '15:30', placeName: 'Main St Clinic' });
    expect(events((await core.subscriptionFeed(secret))!)).toMatchObject([
      { DTSTART: '20261120T203000Z', LOCATION: 'Main St Clinic' },
    ]);
    await core.cancelAppointment(mark, added.id);
    expect(events((await core.subscriptionFeed(secret))!)).toEqual([]);
  });

  it("keeps each Appointment's identity, so a calendar app updates it rather than adding another", async () => {
    const { core } = calendar();
    const added = await core.addAppointment(mark, checkUp);
    const { secret } = await core.makeSubscriptionLink(linda);
    const before = events((await core.subscriptionFeed(secret))!)[0];
    await core.changeAppointment(mark, added.id, { time: '15:30' });
    const after = events((await core.subscriptionFeed(secret))!)[0];
    expect(after.UID).toBe(before.UID);
    expect(after['LAST-MODIFIED']).not.toBe('');
  });

  it('writes words a calendar app reads back as they were, however long', async () => {
    const { core } = calendar();
    const note =
      'Fasting: no food, no coffee; water is fine.\nTake the 8:15 bus — Café Ñandú stop. '.repeat(
        3,
      );
    await core.addAppointment(linda, { ...checkUp, noteForSusan: note });
    const feed = (await core.subscriptionFeed((await core.makeSubscriptionLink(linda)).secret))!;
    for (const line of feed.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(events(feed)[0].DESCRIPTION).toBe(
      `Note for Susan: ${note.trim().replace(/[^\S\n]+/g, ' ')}`,
    );
  });

  it('keeps only a hash of the link, so it is seen in full only when made', async () => {
    const { core, store } = calendar();
    const made = await core.makeSubscriptionLink(linda);
    expect(made.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(made.madeAt).toBe('2026-11-19T20:00:00.000Z');
    const kept = await store.subscriptionLinkOf(linda.person.id);
    expect(kept).toEqual({
      personId: linda.person.id,
      hash: expect.any(String),
      madeAt: made.madeAt,
    });
    expect(JSON.stringify(store.subscriptionLinks())).not.toContain(made.secret);
  });

  it('gives nothing for a link that is unknown or switched off, and the same nothing for both', async () => {
    const { core } = calendar();
    await core.addAppointment(linda, everyDetail);
    const { secret } = await core.makeSubscriptionLink(linda);
    await core.switchOffSubscriptionLink(linda);
    expect(await core.subscriptionFeed(secret)).toBeNull();
    expect(
      await core.subscriptionFeed(secret.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'))),
    ).toBeNull();
    for (const notOne of ['', 'not-a-link', null, 42, { secret }, `${secret}x`])
      expect(await core.subscriptionFeed(notOne)).toBeNull();
  });

  it('a new link switches off the old one', async () => {
    const { core, store } = calendar();
    const old = await core.makeSubscriptionLink(linda);
    const replacement = await core.makeSubscriptionLink(linda);
    expect(replacement.secret).not.toBe(old.secret);
    expect(await core.subscriptionFeed(old.secret)).toBeNull();
    expect(await core.subscriptionFeed(replacement.secret)).toContain('BEGIN:VCALENDAR');
    expect(store.subscriptionLinks()).toHaveLength(1);
  });

  it("is each person's own: switching off one link leaves everyone else's working", async () => {
    const { core } = calendar();
    const lindas = await core.makeSubscriptionLink(linda);
    const marks = await core.makeSubscriptionLink(mark);
    await core.switchOffSubscriptionLink(linda);
    expect(await core.subscriptionFeed(lindas.secret)).toBeNull();
    expect(await core.subscriptionFeed(marks.secret)).toContain('BEGIN:VCALENDAR');
    // Switching off a link that is already off changes nothing.
    await core.switchOffSubscriptionLink(linda);
    expect(await core.subscriptionFeed(marks.secret)).toContain('BEGIN:VCALENDAR');
  });

  it('is no Activity record: the Appointments did not change', async () => {
    const { core, store } = calendar();
    await core.makeSubscriptionLink(susan);
    await core.switchOffSubscriptionLink(susan);
    expect(store.activity()).toEqual([]);
  });
});
