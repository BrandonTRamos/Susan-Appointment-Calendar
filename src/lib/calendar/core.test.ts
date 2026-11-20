import { describe, expect, it, vi } from 'vitest';
import {
  CalendarRefusal,
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  createMemoryStore,
  createStandInSender,
  NO_ADMIN_MESSENGER,
  overlappingAppointments,
  pastAppointments,
  remindersStillToSend,
  reminderWords,
  upcomingAppointments,
  type Actor,
  type Appointment,
  type NewAppointment,
  type ReminderSetting,
  NO_TEXT_SENDER,
  type CalendarCore,
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
  const sender = createStandInSender();
  return {
    store,
    clock,
    messenger,
    sender,
    core: createCalendarCore({ store, clock, messenger, textSender: sender, timeZone }),
  };
}

/** An invented mobile number for Susan: 555-01xx numbers belong to nobody. */
const SUSANS_NUMBER = '+15555550123';

/**
 * Sends Susan the Appointment's first Reminder, as the scheduled run would: sets her number, moves
 * the clock to the Reminder's time and runs what is due.
 */
async function remind(
  { core, clock }: ReturnType<typeof calendar>,
  appointment: Appointment,
): Promise<void> {
  await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
  clock.set(appointment.reminders[0].dueAt);
  await core.runDue();
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
    const cal = calendar();
    const { core, store } = cal;
    const added = await core.addAppointment(linda, checkUp);
    await remind(cal, added);
    expect(store.texts()).toMatchObject([{ appointmentId: added.id, status: 'sent' }]);
    const refusal = await refused(core.deleteAppointment(linda, added.id), 'texted');
    expect(refusal.message).toMatch(/Cancel it instead/);
    expect(store.appointments()).toEqual([added]);
  });

  it('is still allowed for another Appointment she has not been texted about', async () => {
    const cal = calendar();
    const { core, store } = cal;
    const texted = await core.addAppointment(linda, checkUp);
    const mistake = await core.addAppointment(linda, {
      ...checkUp,
      what: 'Wrong day',
      date: '2026-11-27',
    });
    await remind(cal, texted);
    await core.deleteAppointment(mark, mistake.id);
    expect(store.appointments()).toEqual([texted]);
  });

  it('is allowed when its only texts were never sent, or refused outright', async () => {
    const cal = calendar();
    const { core, store, clock, sender } = cal;
    const notSent = await core.addAppointment(linda, checkUp);
    clock.set(notSent.reminders[0].dueAt);
    await core.runDue(); // no number yet: recorded as not sent
    const refusedOne = await core.addAppointment(linda, {
      ...checkUp,
      what: 'Blood draw',
      reminders: [{ shape: 'before', amount: 1, unit: 'hours' }],
    });
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    sender.refuseNext();
    clock.set(refusedOne.reminders[0].dueAt);
    await core.runDue();
    expect(store.texts().map((text) => [text.status, text.reason])).toEqual([
      ['notSent', 'noNumber'],
      ['failed', 'refused'],
    ]);
    await core.deleteAppointment(linda, notSent.id);
    await core.deleteAppointment(linda, refusedOne.id);
    expect(store.appointments()).toEqual([]);
  });

  it('removes a cancelled Appointment too, unless she was texted about it', async () => {
    const cal = calendar();
    const { core, store } = cal;
    const first = await core.addAppointment(linda, { ...checkUp, date: '2026-11-27' });
    const second = await core.addAppointment(linda, { ...checkUp, what: 'Blood draw' });
    await remind(cal, second);
    await core.cancelAppointment(linda, first.id);
    await core.cancelAppointment(linda, second.id);
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
    const cal = calendar();
    const { core, store } = cal;
    const added = await core.addAppointment(linda, checkUp);
    const { id } = added;
    await remind(cal, added);
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

  it('name the Reminders when they are what changed', async () => {
    const { core, messenger } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    await core.changeAppointment(mark, id, {
      reminders: [{ shape: 'before', amount: 2, unit: 'hours' }],
    });
    expect(told(messenger)[1]).toMatchObject({
      to: ['person-linda', 'person-ann'],
      body: 'Mark changed Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm: the Reminders.',
    });
  });

  it('do not name the Reminders when only moving the Appointment worked them out again', async () => {
    const { core, messenger } = calendar();
    const { id } = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'at', date: '2026-11-20', time: '09:00' },
      ],
    });
    const moved = await core.changeAppointment(mark, id, { time: '15:30' });
    // The exact-time Reminder is flagged for review, and the other falls due afresh: both follow
    // from the move, which is all Mark did.
    expect(moved.reminders.some((r) => r.needsReview)).toBe(true);
    expect(told(messenger)[1].body).toBe(
      'Mark changed Cardiology check-up, Fri, Nov 20, 2026 at 3:30 pm: the start time (was 2:00 pm).',
    );

    // Confirming the flagged one is a change to the Reminders.
    await core.changeAppointment(ann, id, {
      reminders: moved.reminders.map((r) => (r.needsReview ? { ...r, reviewed: true } : r)),
    });
    expect(told(messenger)[2].body).toBe(
      'Ann changed Cardiology check-up, Fri, Nov 20, 2026 at 3:30 pm: the Reminders.',
    );
  });

  it('do not name the Reminders when a move later on works out when their times were set', async () => {
    const { core, clock, messenger } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [{ shape: 'before', amount: 2, unit: 'hours' }],
    });
    clock.set('2026-11-19T21:00:00.000Z');
    const moved = await core.changeAppointment(mark, added.id, { time: '15:30' });
    // The move worked the Reminder's time out again an hour after it was set, and says so.
    expect(moved.reminders[0].setAt).not.toBe(added.reminders[0].setAt);
    expect(told(messenger)[1].body).toBe(
      'Mark changed Cardiology check-up, Fri, Nov 20, 2026 at 3:30 pm: the start time (was 2:00 pm).',
    );
  });

  it('do not name the Reminders when an edit records when an older Reminder was set', async () => {
    const { core, clock, messenger, store } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    // As ticket 07 kept it: no record of when its Reminder was set.
    await store.replaceAppointment({
      ...added,
      reminders: added.reminders.map((reminder) => ({ ...reminder, setAt: null })),
    });
    clock.set('2026-11-19T21:00:00.000Z');
    const edited = await core.changeAppointment(mark, added.id, { noteForSusan: 'Glasses.' });
    expect(edited.reminders[0].setAt).toBe(added.added.at);
    expect(told(messenger)[1].body).toBe(
      'Mark changed Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm: the Note for Susan.',
    );
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
    const core = createCalendarCore({
      store,
      clock,
      messenger,
      textSender: createStandInSender(),
      timeZone: EASTERN,
    });
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
    const cal = calendar();
    const { core, messenger } = cal;
    const sentId = '3f0c8a52-9d1e-4b7a-8c11-5e2f6a7b8c9d';
    const added = await core.addAppointment(linda, checkUp, sentId);
    await core.addAppointment(linda, checkUp, sentId);
    await core.changeAppointment(mark, sentId, { time: '14:00' });
    await refused(core.changeAppointment(mark, sentId, { what: '' }), 'invalid');
    // Susan is sent a Reminder, so that the delete below is refused. Sending tells no Admin.
    await remind(cal, added);
    await core.cancelAppointment(mark, sentId);
    await refused(core.cancelAppointment(mark, sentId), 'cancelled');
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
      textSender: NO_TEXT_SENDER,
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

/** Each Reminder's shape, when it goes out and whether it is flagged, without its ID. */
/** Each Reminder's timing, when it goes out and whether it is flagged; when it was set is apart. */
const plan = (appointment: Appointment) =>
  appointment.reminders.map(({ id: _id, setAt: _setAt, ...reminder }) => reminder);

/** When each Reminder goes out. */
const dueTimes = (appointment: Appointment) => appointment.reminders.map((r) => r.dueAt);

const dayBeforeAtSix: ReminderSetting = { shape: 'daysBefore', days: 1, time: '18:00' };
const twoHoursBefore: ReminderSetting = { shape: 'before', amount: 2, unit: 'hours' };
const thursdayAtEight: ReminderSetting = { shape: 'at', date: '2026-11-19', time: '20:00' };

describe('Reminders on an Appointment', () => {
  it('a new one starts with one Reminder, the day before at 6:00 pm', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    expect(plan(added)).toEqual([
      {
        shape: 'daysBefore',
        days: 1,
        time: '18:00',
        // Thursday 19 November, 6:00 pm in US Eastern.
        dueAt: '2026-11-19T23:00:00.000Z',
        needsReview: false,
      },
    ]);
    expect(added.reminders[0].id).toMatch(/\w{8}-/);
  });

  it('the starting Reminder can be removed: an Appointment can have none', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, { ...checkUp, reminders: [] });
    expect(added.reminders).toEqual([]);
    const { id } = await core.addAppointment(linda, checkUp);
    const changed = await core.changeAppointment(linda, id, { reminders: [] });
    expect(changed.reminders).toEqual([]);
  });

  it('carries any number, in the order they go out', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [
        twoHoursBefore,
        dayBeforeAtSix,
        thursdayAtEight,
        { shape: 'before', amount: 30, unit: 'minutes' },
      ],
    });
    expect(added.reminders.map((r) => r.shape)).toEqual(['daysBefore', 'at', 'before', 'before']);
    expect(new Set(added.reminders.map((r) => r.id)).size).toBe(4);
  });

  it.each<[string, ReminderSetting, string]>([
    [
      '30 minutes before',
      { shape: 'before', amount: 30, unit: 'minutes' },
      '2026-11-20T18:30:00.000Z',
    ],
    ['2 hours before', twoHoursBefore, '2026-11-20T17:00:00.000Z'],
    ['1 day before', { shape: 'before', amount: 1, unit: 'days' }, '2026-11-19T19:00:00.000Z'],
    [
      '3 days before at 9:00 am',
      { shape: 'daysBefore', days: 3, time: '09:00' },
      '2026-11-17T14:00:00.000Z',
    ],
    [
      'the same day at 8:00 am',
      { shape: 'daysBefore', days: 0, time: '08:00' },
      '2026-11-20T13:00:00.000Z',
    ],
    ['on Thursday at 8:00 pm', thursdayAtEight, '2026-11-20T01:00:00.000Z'],
  ])('works out when one goes out: %s', async (_name, reminder, dueAt) => {
    const { core } = calendar();
    // Friday 20 November at 2:00 pm, US Eastern.
    const added = await core.addAppointment(linda, { ...checkUp, reminders: [reminder] });
    expect(dueTimes(added)).toEqual([dueAt]);
  });

  it('measures a gap from the start time, not the pickup time', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, {
      ...everyDetail,
      pickupTime: '13:15',
      reminders: [{ shape: 'before', amount: 1, unit: 'hours' }],
    });
    // 1:00 pm, an hour before the 2:00 pm start.
    expect(dueTimes(added)).toEqual(['2026-11-20T18:00:00.000Z']);
  });

  it.each<[string, unknown]>([
    ['a gap of nothing', { shape: 'before', amount: 0, unit: 'hours' }],
    ['a gap in part-hours', { shape: 'before', amount: 1.5, unit: 'hours' }],
    ['a gap in weeks', { shape: 'before', amount: 1, unit: 'weeks' }],
    ['days before that are fewer than none', { shape: 'daysBefore', days: -1, time: '18:00' }],
    ['a clock time that is not one', { shape: 'daysBefore', days: 1, time: '6 pm' }],
    ['a date that is not one', { shape: 'at', date: '2026-11-31', time: '18:00' }],
    ['a shape there is not', { shape: 'weekly', days: 1 }],
    ['not a Reminder at all', 'the day before'],
    ['an exact time after the start', { shape: 'at', date: '2027-03-15', time: '15:00' }],
    ['an exact time at the start', { shape: 'at', date: '2027-03-15', time: '14:00' }],
    ['a same-day time after the start', { shape: 'daysBefore', days: 0, time: '15:00' }],
    ['a same-day time at the start', { shape: 'daysBefore', days: 0, time: '14:00' }],
    ['an exact time the clocks skip', { shape: 'at', date: '2027-03-14', time: '02:30' }],
  ])('refuses %s, saying which Reminder, and keeps nothing', async (_name, reminder) => {
    const { core, store } = calendar();
    const refusal = await refused(
      core.addAppointment(linda, {
        ...checkUp,
        date: '2027-03-15',
        reminders: [dayBeforeAtSix, reminder as ReminderSetting],
      }),
      'invalid',
    );
    expect(refusal.detail).toBe('reminders');
    expect(refusal.message).toMatch(/^Reminder 2: /);
    expect(store.appointments()).toEqual([]);
  });

  it('carries more than twenty, with no count it stops at', async () => {
    const { core, store } = calendar();
    const many = (count: number) =>
      Array.from({ length: count }, (_, n) => ({
        shape: 'before' as const,
        amount: n + 1,
        unit: 'hours' as const,
      }));
    const added = await core.addAppointment(linda, { ...checkUp, reminders: many(21) });
    expect(added.reminders).toHaveLength(21);
    const changed = await core.changeAppointment(mark, added.id, { reminders: many(30) });
    expect(changed.reminders).toHaveLength(30);
    expect(new Set(changed.reminders.map((r) => r.id)).size).toBe(30);
    expect(store.appointments()[0].reminders).toHaveLength(30);
  });

  it('refuses a list of Reminders that is not one', async () => {
    const { core } = calendar();
    await refused(
      core.addAppointment(linda, { ...checkUp, reminders: 'none' as unknown as [] }),
      'invalid',
    );
  });

  it('can be changed and removed one by one, keeping the rest as they were', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [dayBeforeAtSix, twoHoursBefore, thursdayAtEight],
    });
    const [dayBefore, atEight, twoHours] = added.reminders;
    const changed = await core.changeAppointment(mark, added.id, {
      reminders: [
        dayBefore,
        { ...twoHours, amount: 3 } as ReminderSetting,
        { shape: 'before', amount: 30, unit: 'minutes' },
      ],
    });
    expect(changed.reminders).toHaveLength(3);
    expect(changed.reminders[0]).toEqual(dayBefore);
    expect(changed.reminders[1]).toMatchObject({ id: twoHours.id, amount: 3 });
    expect(changed.reminders[1].dueAt).toBe('2026-11-20T16:00:00.000Z');
    expect(changed.reminders.map((r) => r.id)).not.toContain(atEight.id);
    expect(changed.lastChanged).toMatchObject({ personName: 'Mark' });
  });

  it('are set by the same save as the details, which leaves one activity record', async () => {
    const { core, store } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [dayBeforeAtSix, twoHoursBefore],
    });
    expect(added.reminders).toHaveLength(2);
    expect(store.activity()).toMatchObject([{ action: 'added' }]);
    const changed = await core.changeAppointment(mark, added.id, {
      time: '15:30',
      reminders: [thursdayAtEight],
    });
    expect(changed).toMatchObject({ time: '15:30', reminders: [thursdayAtEight] });
    expect(store.activity()).toMatchObject([{ action: 'added' }, { action: 'changed' }]);
    // A save that changes only the Reminders is a change too, and one record.
    await core.changeAppointment(linda, added.id, { reminders: [] });
    expect(store.activity()).toHaveLength(3);
  });

  it('does nothing when the Reminders sent are the ones it has', async () => {
    const { core, store } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    expect(await core.changeAppointment(mark, added.id, { reminders: added.reminders })).toEqual(
      added,
    );
    expect(store.activity()).toHaveLength(1);
  });

  it('an add that arrives twice with its Reminders is carried out once', async () => {
    const { core, store } = calendar();
    const id = '3f0c8a52-9d1e-4b7a-8c11-5e2f6a7b8c9d';
    const details = { ...checkUp, reminders: [dayBeforeAtSix, twoHoursBefore] };
    const first = await core.addAppointment(linda, details, id);
    expect(await core.addAppointment(linda, details, id)).toEqual(first);
    await refused(core.addAppointment(linda, { ...details, reminders: [] }, id), 'invalid');
    expect(store.appointments()).toEqual([first]);
  });
});

describe('when an Appointment moves', () => {
  async function moving() {
    const setup = calendar();
    const added = await setup.core.addAppointment(linda, {
      ...checkUp,
      reminders: [dayBeforeAtSix, twoHoursBefore, thursdayAtEight],
    });
    return { ...setup, added };
  }

  it('its gap and day-before Reminders follow it to the new time', async () => {
    const { core, added } = await moving();
    const moved = await core.changeAppointment(mark, added.id, {
      date: '2026-11-24',
      time: '10:00',
    });
    const [dayBefore, twoHours] = moved.reminders.filter((r) => r.shape !== 'at');
    // Monday 23 November at 6:00 pm, and Tuesday 24 November at 8:00 am.
    expect(dayBefore.dueAt).toBe('2026-11-23T23:00:00.000Z');
    expect(twoHours.dueAt).toBe('2026-11-24T13:00:00.000Z');
    expect(dayBefore.needsReview).toBe(false);
    expect(twoHours.needsReview).toBe(false);
  });

  it('an exact-time Reminder keeps its time and is flagged for review', async () => {
    const { core, added } = await moving();
    const moved = await core.changeAppointment(mark, added.id, { time: '10:00' });
    expect(moved.reminders.find((r) => r.shape === 'at')).toMatchObject({
      date: '2026-11-19',
      time: '20:00',
      dueAt: '2026-11-20T01:00:00.000Z',
      needsReview: true,
    });
  });

  it('a flagged Reminder stays flagged until someone confirms it or changes it', async () => {
    const { core, added } = await moving();
    const moved = await core.changeAppointment(mark, added.id, { time: '10:00' });
    const later = await core.changeAppointment(mark, added.id, { what: 'Heart check-up' });
    expect(later.reminders.find((r) => r.shape === 'at')?.needsReview).toBe(true);
    // Sent back as it is, it is still flagged: nobody has looked at it.
    const resent = await core.changeAppointment(mark, added.id, { reminders: later.reminders });
    expect(resent.reminders.find((r) => r.shape === 'at')?.needsReview).toBe(true);

    const confirmed = await core.changeAppointment(linda, added.id, {
      reminders: moved.reminders.map((r) => (r.shape === 'at' ? { ...r, reviewed: true } : r)),
    });
    expect(confirmed.reminders.find((r) => r.shape === 'at')).toMatchObject({
      dueAt: '2026-11-20T01:00:00.000Z',
      needsReview: false,
    });

    const again = await core.changeAppointment(mark, added.id, { time: '14:00' });
    const reset = await core.changeAppointment(linda, added.id, {
      reminders: again.reminders.map((r) => (r.shape === 'at' ? { ...r, time: '19:00' } : r)),
    });
    expect(reset.reminders.find((r) => r.shape === 'at')).toMatchObject({
      dueAt: '2026-11-20T00:00:00.000Z',
      needsReview: false,
    });
  });

  it('a flagged Reminder now after the start is kept, not refused, until someone sees to it', async () => {
    const { core, added } = await moving();
    const moved = await core.changeAppointment(mark, added.id, {
      date: '2026-11-19',
      time: '17:00',
    });
    expect(moved.reminders.find((r) => r.shape === 'at')?.needsReview).toBe(true);
    // Confirming it as it is would leave a Reminder after the start.
    await refused(
      core.changeAppointment(linda, added.id, {
        reminders: moved.reminders.map((r) => (r.shape === 'at' ? { ...r, reviewed: true } : r)),
      }),
      'invalid',
    );
  });

  it('a flagged Reminder now exactly at the start is kept too, and cannot be confirmed there', async () => {
    const { core, added } = await moving();
    // Thursday at 8:00 pm, exactly when the exact-time Reminder goes out.
    const moved = await core.changeAppointment(mark, added.id, {
      date: '2026-11-19',
      time: '20:00',
    });
    expect(moved.reminders.find((r) => r.shape === 'at')).toMatchObject({
      dueAt: moved.startsAt,
      needsReview: true,
    });
    await refused(
      core.changeAppointment(linda, added.id, {
        reminders: moved.reminders.map((r) => (r.shape === 'at' ? { ...r, reviewed: true } : r)),
      }),
      'invalid',
    );
  });

  it('a move that would put a same-day Reminder at or after the new start is refused, naming it', async () => {
    const { core, store } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [{ shape: 'daysBefore', days: 0, time: '09:00' }],
    });
    const refusal = await refused(
      core.changeAppointment(mark, added.id, { time: '09:00' }),
      'invalid',
    );
    expect(refusal.message).toMatch(/^Reminder 1: /);
    expect(store.appointments()).toEqual([added]);
  });

  it('a change to the pickup time or any other detail moves no Reminder and flags none', async () => {
    const { core, added } = await moving();
    const changed = await core.changeAppointment(mark, added.id, {
      pickupTime: '12:00',
      placeName: 'Heart Clinic',
    });
    expect(changed.reminders).toEqual(added.reminders);
  });

  it('a Reminder added in the same change as the move is not flagged', async () => {
    const { core, added } = await moving();
    const moved = await core.changeAppointment(mark, added.id, {
      time: '16:00',
      reminders: [{ shape: 'at', date: '2026-11-20', time: '09:00' }],
    });
    expect(plan(moved)).toEqual([
      {
        shape: 'at',
        date: '2026-11-20',
        time: '09:00',
        dueAt: '2026-11-20T14:00:00.000Z',
        needsReview: false,
      },
    ]);
  });
});

describe('Reminders across a clock change', () => {
  // US Eastern clocks go back on Sunday 7 November 2027 and forward on Sunday 14 March 2027.
  it('a day before means the same clock time the day before, not 24 hours', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      date: '2027-11-07',
      reminders: [
        { shape: 'before', amount: 1, unit: 'days' },
        { shape: 'before', amount: 24, unit: 'hours' },
        dayBeforeAtSix,
      ],
    });
    // Sunday at 2:00 pm EST is 19:00 UTC. A day before is Saturday at 2:00 pm EDT; 24 hours before
    // is Saturday at 3:00 pm EDT, because that Sunday is an hour longer.
    expect(dueTimes(added)).toEqual([
      '2027-11-06T18:00:00.000Z',
      '2027-11-06T19:00:00.000Z',
      '2027-11-06T22:00:00.000Z',
    ]);
  });

  it('a Reminder at a time the clocks skip goes out when they land, an hour later', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      date: '2027-03-15',
      time: '09:00',
      reminders: [{ shape: 'daysBefore', days: 1, time: '02:30' }],
    });
    // 3:30 am EDT on Sunday 14 March.
    expect(dueTimes(added)).toEqual(['2027-03-14T07:30:00.000Z']);
  });

  it('a gap in days that lands on a time the clocks skip goes out when they land', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      date: '2027-03-15',
      time: '02:30',
      reminders: [{ shape: 'before', amount: 1, unit: 'days' }],
    });
    // Sunday 14 March at 2:30 am does not exist; it goes out at 3:30 am EDT.
    expect(dueTimes(added)).toEqual(['2027-03-14T07:30:00.000Z']);
  });

  it('an exact time the clocks skip is refused when it is set, and when it is changed to', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, { ...checkUp, date: '2027-03-15' });
    const refusal = await refused(
      core.changeAppointment(mark, added.id, {
        reminders: [{ shape: 'at', date: '2027-03-14', time: '02:30' }],
      }),
      'invalid',
    );
    expect(refusal.message).toMatch(/clocks go forward/);
  });

  it('follows an Appointment that moves across the change', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, { ...checkUp, date: '2027-03-12' });
    // Thursday 11 March, 6:00 pm EST.
    expect(dueTimes(added)).toEqual(['2027-03-11T23:00:00.000Z']);
    const moved = await core.changeAppointment(mark, added.id, { date: '2027-03-16' });
    // Monday 15 March, 6:00 pm EDT.
    expect(dueTimes(moved)).toEqual(['2027-03-15T22:00:00.000Z']);
  });
});

describe('Reminders still to be sent', () => {
  it('are those whose time has not yet come, on an Appointment that is not cancelled', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      // Wednesday at 6:00 pm has passed; Thursday at 8:00 pm and two hours before have not.
      reminders: [{ shape: 'daysBefore', days: 2, time: '18:00' }, thursdayAtEight, twoHoursBefore],
    });
    const now = new Date('2026-11-19T20:00:00.000Z');
    expect(remindersStillToSend(added, now).map((r) => r.dueAt)).toEqual([
      '2026-11-20T01:00:00.000Z',
      '2026-11-20T17:00:00.000Z',
    ]);
    const cancelled = await core.cancelAppointment(linda, added.id);
    expect(remindersStillToSend(cancelled, now)).toEqual([]);
  });

  it('leave out one held for review since its Appointment moved: it is not sent as it stands', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [thursdayAtEight, twoHoursBefore],
    });
    const moved = await core.changeAppointment(mark, added.id, { time: '15:00' });
    const now = new Date('2026-11-19T20:00:00.000Z');
    expect(moved.reminders.map((r) => r.needsReview)).toEqual([true, false]);
    expect(remindersStillToSend(moved, now).map((r) => r.dueAt)).toEqual([
      '2026-11-20T18:00:00.000Z',
    ]);
  });
});

describe("a Reminder's words", () => {
  /** What Susan would read in each Reminder on an Appointment with these details. */
  async function words(details: NewAppointment) {
    const { core } = calendar();
    const added = await core.addAppointment(linda, details);
    return added.reminders.map((reminder) => reminderWords(added, reminder, EASTERN));
  }

  it('say what, who with, the day and time, where, the Driver and pickup, then the Note', async () => {
    expect(await words(everyDetail)).toEqual([
      "Susan's Calendar: Cardiology check-up with Dr. Patel, tomorrow at 2:00 pm, at Heart Clinic, 400 Main St. Linda picks you up at 1:15 pm. Bring your list of medicines.",
    ]);
  });

  it('never include the Private notes', async () => {
    const [text] = await words(everyDetail);
    expect(text).not.toMatch(/prescription/);
  });

  it('leave out each detail the Appointment does not have', async () => {
    expect(await words(checkUp)).toEqual([
      "Susan's Calendar: Cardiology check-up, tomorrow at 2:00 pm.",
    ]);
    expect(await words({ ...checkUp, placeName: 'Heart Clinic' })).toEqual([
      "Susan's Calendar: Cardiology check-up, tomorrow at 2:00 pm, at Heart Clinic.",
    ]);
    expect(await words({ ...checkUp, placeAddress: '400 Main St' })).toEqual([
      "Susan's Calendar: Cardiology check-up, tomorrow at 2:00 pm, at 400 Main St.",
    ]);
    expect(await words({ ...checkUp, driverName: 'Linda' })).toEqual([
      "Susan's Calendar: Cardiology check-up, tomorrow at 2:00 pm. Linda is driving you.",
    ]);
    expect(await words({ ...checkUp, pickupTime: '13:15' })).toEqual([
      "Susan's Calendar: Cardiology check-up, tomorrow at 2:00 pm. Pickup is at 1:15 pm.",
    ]);
    expect(await words({ ...checkUp, noteForSusan: "Don't eat after midnight" })).toEqual([
      "Susan's Calendar: Cardiology check-up, tomorrow at 2:00 pm. Don't eat after midnight.",
    ]);
  });

  it('give the day as it is when the Reminder goes out: today, tomorrow, or the weekday and date', async () => {
    expect(
      await words({
        ...checkUp,
        reminders: [
          { shape: 'before', amount: 2, unit: 'hours' },
          // 11:00 pm Thursday in US Eastern, though it is already Friday in UTC.
          { shape: 'at', date: '2026-11-19', time: '23:00' },
          { shape: 'before', amount: 3, unit: 'days' },
        ],
      }),
    ).toEqual([
      "Susan's Calendar: Cardiology check-up, Friday, November 20 at 2:00 pm.",
      "Susan's Calendar: Cardiology check-up, tomorrow at 2:00 pm.",
      "Susan's Calendar: Cardiology check-up, today at 2:00 pm.",
    ]);
  });

  it('follow the Appointment when its details change', async () => {
    const { core } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    const changed = await core.changeAppointment(mark, added.id, {
      time: '15:30',
      placeName: 'Vision Center',
    });
    expect(reminderWords(changed, changed.reminders[0], EASTERN)).toBe(
      "Susan's Calendar: Cardiology check-up, tomorrow at 3:30 pm, at Vision Center.",
    );
  });

  it('keep to the basic text-message characters where they can', async () => {
    const [text] = await words({
      ...checkUp,
      what: 'Check-up — “annual”',
      withWhom: 'Dr. O’Brien and Zoë',
      placeName: 'Café Clinic…',
      noteForSusan: 'Bring the ‘blue’ folder\u00a0– and £5.',
    });
    expect(text).toBe(
      "Susan's Calendar: Check-up - \"annual\" with Dr. O'Brien and Zoe, tomorrow at 2:00 pm, at Café Clinic... Bring the 'blue' folder - and £5.",
    );
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

describe('sending texts on schedule', () => {
  /** A calendar with Susan's number set, and an Appointment tomorrow at 2:00 pm. */
  async function ready(details: Partial<NewAppointment> = {}) {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await cal.core.addAppointment(linda, { ...everyDetail, ...details });
    return { ...cal, added };
  }

  it('sends a due Reminder on the next run, to her number, in its words', async () => {
    const { core, clock, sender, added } = await ready();
    expect(await core.runDue()).toEqual([]);
    clock.set('2026-11-19T23:00:00.000Z'); // 6:00 pm, the day before
    await core.runDue();
    expect(sender.taken()).toEqual([
      { to: SUSANS_NUMBER, words: reminderWords(added, added.reminders[0], EASTERN) },
    ]);
    expect(sender.taken()[0].words).toMatch(/^Susan's Calendar: Cardiology check-up .* tomorrow/);
    expect(sender.taken()[0].words).not.toMatch(/prescription/);
  });

  it('records each text with its kind, Appointment, words, due time and status', async () => {
    const { core, clock, sender, store, added } = await ready();
    clock.set('2026-11-19T23:00:30.000Z');
    await core.runDue();
    expect(store.texts()).toEqual([
      {
        id: expect.any(String),
        kind: 'reminder',
        appointmentId: added.id,
        reminderId: added.reminders[0].id,
        words: sender.taken()[0].words,
        dueAt: '2026-11-19T23:00:00.000Z',
        status: 'sent',
        reason: null,
        attempts: 1,
        triedAt: '2026-11-19T23:00:30.000Z',
        sentAt: '2026-11-19T23:00:30.000Z',
        reference: expect.any(String),
        told: { date: '2026-11-20', time: '14:00', cancelled: false },
      },
    ]);
    // The record holds neither Susan's number nor the Private notes.
    expect(JSON.stringify(store.texts())).not.toMatch(/5555550123|prescription/);
  });

  it('sends each Reminder once, however many runs see it', async () => {
    const { core, clock, sender } = await ready();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    clock.set('2026-11-19T23:01:00.000Z');
    await core.runDue();
    clock.set('2026-11-19T23:30:00.000Z');
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
  });

  it('sends a text once when two runs overlap, each claiming it before sending', async () => {
    const { core, clock, sender, store, added } = await ready();
    // A second core over the same store, as a second run in another function would be.
    const other = createCalendarCore({
      store,
      clock,
      messenger: createMemoryMessenger(),
      textSender: sender,
      timeZone: EASTERN,
    });
    clock.set(added.reminders[0].dueAt);
    await Promise.all([core.runDue(), other.runDue(), core.runDue()]);
    expect(sender.taken()).toHaveLength(1);
    expect(store.texts()).toHaveLength(1);
  });

  it('sends every Reminder that is due, in the order they fell due', async () => {
    const { core, clock, sender } = await ready({
      reminders: [
        { shape: 'before', amount: 2, unit: 'hours' },
        { shape: 'daysBefore', days: 1, time: '18:00' },
      ],
    });
    await core.addAppointment(mark, {
      what: 'Blood draw',
      date: '2026-11-20',
      time: '13:00',
      reminders: [{ shape: 'before', amount: 2, unit: 'hours' }],
    });
    clock.set('2026-11-20T17:00:00.000Z'); // noon on Friday: all three have come due
    await core.runDue();
    expect(sender.taken().map((text) => /Cardiology|Blood draw/.exec(text.words)?.[0])).toEqual([
      'Cardiology',
      'Blood draw',
      'Cardiology',
    ]);
  });

  it('tries again a send that might not have gone through, a little later', async () => {
    const { core, clock, sender, store } = await ready();
    sender.breakNext();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'waiting', attempts: 1 }]);
    clock.set('2026-11-19T23:01:00.000Z'); // a minute on: it may still be going, so it is left
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'waiting', attempts: 1 }]);
    clock.set('2026-11-19T23:02:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'sent', attempts: 2, reason: null }]);
    expect(sender.taken()).toHaveLength(1);
  });

  it('counts a text as failed once every try has failed', async () => {
    const { core, clock, sender, store } = await ready();
    sender.breakNext(3);
    for (const at of ['23:00', '23:02', '23:04', '23:06', '23:08']) {
      clock.set(`2026-11-19T${at}:00.000Z`);
      await core.runDue();
    }
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'gaveUp', attempts: 3 }]);
    expect(sender.taken()).toEqual([]);
  });

  it('does not try again a text the sender refused: it certainly did not go', async () => {
    const { core, clock, sender, store } = await ready();
    sender.refuseNext();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    clock.set('2026-11-19T23:10:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'refused', attempts: 1 }]);
    expect(sender.taken()).toEqual([]);
  });

  it('takes up again a text a run claimed and then stopped on', async () => {
    const { core, clock, sender, store, added } = await ready();
    // What a run that stopped mid-send leaves: a claim, tried once, never answered.
    const [reminder] = added.reminders;
    await store.claimText({
      id: `reminder:${added.id}:${reminder.id}:${reminder.dueAt}`,
      kind: 'reminder',
      appointmentId: added.id,
      reminderId: reminder.id,
      words: "Susan's Calendar: Cardiology check-up.",
      dueAt: reminder.dueAt,
      status: 'waiting',
      reason: null,
      attempts: 1,
      triedAt: reminder.dueAt,
      sentAt: null,
      reference: null,
      told: { date: added.date, time: added.time, cancelled: false },
    });
    clock.set('2026-11-19T23:05:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'sent', attempts: 2 }]);
    expect(sender.taken()).toHaveLength(1);
  });

  it('still sends a Reminder found overdue, as long as the Appointment has not started', async () => {
    const { core, clock, sender, store } = await ready();
    // The runs stopped from 5:30 pm and start again just before 2:00 pm the next day.
    clock.set('2026-11-20T18:55:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'sent', dueAt: '2026-11-19T23:00:00.000Z' }]);
    // Its words are right for when it goes out: the Appointment is now today.
    expect(sender.taken()[0].words).toMatch(
      /Cardiology check-up with Dr\. Patel, today at 2:00 pm/,
    );
  });

  it('records an overdue Reminder as not sent once the Appointment has started', async () => {
    const { core, clock, sender, store } = await ready();
    clock.set('2026-11-20T19:00:00.000Z'); // 2:00 pm, the moment it starts
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    expect(store.texts()).toMatchObject([
      { kind: 'reminder', status: 'notSent', reason: 'tooLate', attempts: 0 },
    ]);
    clock.set('2026-11-20T19:01:00.000Z');
    await core.runDue();
    expect(store.texts()).toHaveLength(1);
  });

  it("stops at each Appointment's start as the run reaches it, not as it was when the run began", async () => {
    const { core, clock, sender, store } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    // Two overdue Reminders, found at 1:50 pm on Friday: one for an Appointment at 2:20 pm, due at
    // 1:00 pm, and one for an Appointment at 2:00 pm, due at 1:10 pm.
    const later = await core.addAppointment(linda, {
      what: 'Eye exam',
      date: '2026-11-20',
      time: '14:20',
      reminders: [{ shape: 'at', date: '2026-11-20', time: '13:00' }],
    });
    const sooner = await core.addAppointment(linda, {
      what: 'Blood draw',
      date: '2026-11-20',
      time: '14:00',
      reminders: [{ shape: 'at', date: '2026-11-20', time: '13:10' }],
    });
    clock.set('2026-11-20T18:50:00.000Z');
    // The first send is slow: it takes until 2:05 pm, after the Blood draw has started.
    const slow = createCalendarCore({
      store,
      clock,
      messenger: createMemoryMessenger(),
      textSender: {
        async send(text) {
          const result = await sender.send(text);
          clock.set('2026-11-20T19:05:00.000Z');
          return result;
        },
      },
      timeZone: EASTERN,
    });
    await slow.runDue();
    expect(sender.taken().map((text) => /Eye exam|Blood draw/.exec(text.words)?.[0])).toEqual([
      'Eye exam',
    ]);
    expect(
      store.texts().map((text) => [text.appointmentId, text.status, text.reason, text.attempts]),
    ).toEqual([
      [later.id, 'sent', null, 1],
      [sooner.id, 'notSent', 'tooLate', 0],
    ]);
    // Never tried, so it did not reach her: the Blood draw can still be deleted.
    await core.deleteAppointment(mark, sooner.id);
  });

  it('stops trying a text again at its start as the run reaches it, too', async () => {
    const { core, clock, sender, store } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    await core.addAppointment(linda, {
      what: 'Eye exam',
      date: '2026-11-20',
      time: '14:20',
      reminders: [{ shape: 'at', date: '2026-11-20', time: '13:40' }],
    });
    const sooner = await core.addAppointment(linda, {
      what: 'Blood draw',
      date: '2026-11-20',
      time: '14:00',
      reminders: [{ shape: 'at', date: '2026-11-20', time: '13:45' }],
    });
    // At 1:45 pm neither send can tell whether it went.
    sender.breakNext(2);
    clock.set('2026-11-20T18:45:00.000Z');
    await core.runDue();
    expect(store.texts().map((text) => [text.status, text.attempts])).toEqual([
      ['waiting', 1],
      ['waiting', 1],
    ]);
    // At 1:50 pm both are tried again. The first try, the Eye exam's, is slow: it takes until
    // 2:01 pm, after the Blood draw has started.
    const slow = createCalendarCore({
      store,
      clock,
      messenger: createMemoryMessenger(),
      textSender: {
        async send(text) {
          const result = await sender.send(text);
          clock.set('2026-11-20T19:01:00.000Z');
          return result;
        },
      },
      timeZone: EASTERN,
    });
    clock.set('2026-11-20T18:50:00.000Z');
    await slow.runDue();
    expect(sender.taken().map((text) => /Eye exam|Blood draw/.exec(text.words)?.[0])).toEqual([
      'Eye exam',
    ]);
    // Failed, not "not sent": its first try may have reached her.
    expect(store.texts().find((text) => text.appointmentId === sooner.id)).toMatchObject({
      status: 'failed',
      reason: 'tooLate',
      attempts: 1,
    });
    await refused(core.deleteAppointment(mark, sooner.id), 'texted');
  });

  it('gives up trying a text again once the Appointment has started', async () => {
    const { core, clock, sender, store } = await ready({
      reminders: [{ shape: 'before', amount: 1, unit: 'minutes' }],
    });
    sender.breakNext();
    clock.set('2026-11-20T18:59:00.000Z');
    await core.runDue();
    clock.set('2026-11-20T19:01:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'tooLate' }]);
    expect(sender.taken()).toEqual([]);
  });

  it('sends no Reminder for a cancelled Appointment, and records none', async () => {
    const { core, clock, sender, store, added } = await ready();
    await core.cancelAppointment(mark, added.id);
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    clock.set('2026-11-20T20:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    expect(store.texts()).toEqual([]);
  });

  it('does not try again a text whose Appointment was cancelled while it waited', async () => {
    const { core, clock, sender, store, added } = await ready();
    sender.breakNext();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    await core.cancelAppointment(mark, added.id);
    clock.set('2026-11-19T23:03:00.000Z');
    await core.runDue();
    // Failed, not "not sent": the first try may have reached her, so it still cannot be deleted.
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'cancelled' }]);
    expect(sender.taken()).toEqual([]);
    await refused(core.deleteAppointment(mark, added.id), 'texted');
  });

  it('tries a waiting text again once, however many runs overlap to take it up', async () => {
    const { core, clock, sender, store } = await ready();
    const other = createCalendarCore({
      store,
      clock,
      messenger: createMemoryMessenger(),
      textSender: sender,
      timeZone: EASTERN,
    });
    sender.breakNext();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'waiting', attempts: 1 }]);
    clock.set('2026-11-19T23:02:00.000Z');
    await Promise.all([core.runDue(), other.runDue(), core.runDue(), other.runDue()]);
    expect(sender.taken()).toHaveLength(1);
    expect(store.texts()).toMatchObject([{ status: 'sent', attempts: 2 }]);
  });

  it('gives up a waiting text whose Reminder was removed, and still counts it as maybe sent', async () => {
    const { core, clock, sender, store, added } = await ready();
    sender.breakNext();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    await core.changeAppointment(mark, added.id, { reminders: [] });
    clock.set('2026-11-19T23:03:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'outdated' }]);
    expect(sender.taken()).toEqual([]);
    await refused(core.deleteAppointment(mark, added.id), 'texted');
  });

  it('gives up a waiting text whose Reminder was retimed, and sends the Reminder at its new time', async () => {
    const { core, clock, sender, store, added } = await ready();
    sender.breakNext();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    const [reminder] = added.reminders;
    await core.changeAppointment(mark, added.id, {
      reminders: [{ id: reminder.id, shape: 'daysBefore', days: 1, time: '19:00' }],
    });
    clock.set('2026-11-19T23:03:00.000Z');
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    clock.set('2026-11-20T00:00:00.000Z'); // 7:00 pm
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
    expect(store.texts().map((text) => [text.dueAt, text.status, text.reason])).toEqual([
      ['2026-11-19T23:00:00.000Z', 'failed', 'outdated'],
      ['2026-11-20T00:00:00.000Z', 'sent', null],
    ]);
  });

  it('tries a waiting text again with the details as they now are', async () => {
    const { core, clock, sender, added } = await ready();
    sender.breakNext();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    await core.changeAppointment(mark, added.id, { noteForSusan: 'Bring your glasses.' });
    clock.set('2026-11-19T23:03:00.000Z');
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
    expect(sender.taken()[0].words).toMatch(/Bring your glasses\.$/);
  });

  it('holds a waiting text whose Reminder is now flagged for review', async () => {
    const { core, clock, sender, store, added } = await ready({
      reminders: [{ shape: 'at', date: '2026-11-20', time: '09:00' }],
    });
    sender.breakNext();
    clock.set('2026-11-20T14:00:00.000Z'); // 9:00 am
    await core.runDue();
    // The Appointment moves while the text waits: the exact-time Reminder is flagged.
    const moved = await core.changeAppointment(mark, added.id, { time: '16:00' });
    expect(moved.reminders[0].needsReview).toBe(true);
    clock.set('2026-11-20T14:05:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'waiting', attempts: 1 }]);
    expect(sender.taken()).toEqual([]);
    clock.set('2026-11-20T21:00:00.000Z'); // 4:00 pm: it started, still flagged
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'tooLate' }]);
    expect(sender.taken()).toEqual([]);
  });

  it('sends nothing while her number is not set, and says why on each text', async () => {
    const { core, clock, sender, store } = calendar();
    await core.addAppointment(linda, checkUp);
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    expect(store.texts()).toMatchObject([{ status: 'notSent', reason: 'noNumber' }]);
    // Setting the number later does not send a pile of old Reminders at once.
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    clock.set('2026-11-19T23:01:00.000Z');
    await core.runDue();
    expect(sender.taken()).toEqual([]);
  });

  it('stops trying a text again if her number is cleared while it waits', async () => {
    const { core, clock, sender, store } = await ready();
    sender.breakNext();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    await core.changeSettings(linda, { susansNumber: null });
    clock.set('2026-11-19T23:03:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'noNumber' }]);
  });
});

describe('an exact-time Reminder flagged for review', () => {
  async function flagged() {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await cal.core.addAppointment(linda, {
      ...checkUp,
      reminders: [{ shape: 'at', date: '2026-11-20', time: '09:00' }],
    });
    const moved = await cal.core.changeAppointment(mark, added.id, { time: '16:00' });
    expect(moved.reminders[0].needsReview).toBe(true);
    return { ...cal, moved };
  }

  it('does not go out at its time while nobody has reviewed it, and leaves no record', async () => {
    const { core, clock, sender, store } = await flagged();
    clock.set('2026-11-20T14:00:00.000Z'); // 9:00 am, its time
    await core.runDue();
    clock.set('2026-11-20T20:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    expect(store.texts()).toEqual([]);
  });

  it('goes out at its time once someone keeps it', async () => {
    const { core, clock, sender, moved } = await flagged();
    const [reminder] = moved.reminders;
    await core.changeAppointment(linda, moved.id, {
      reminders: [
        { id: reminder.id, shape: 'at', date: '2026-11-20', time: '09:00', reviewed: true },
      ],
    });
    clock.set('2026-11-20T14:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
  });

  it('is not sent late if someone keeps it after its time has passed', async () => {
    const { core, clock, sender, moved } = await flagged();
    clock.set('2026-11-20T15:00:00.000Z'); // 10:00 am, an hour after its time
    const [reminder] = moved.reminders;
    await core.changeAppointment(linda, moved.id, {
      reminders: [
        { id: reminder.id, shape: 'at', date: '2026-11-20', time: '09:00', reviewed: true },
      ],
    });
    await core.runDue();
    expect(sender.taken()).toEqual([]);
  });
});

describe("a Reminder whose time had passed when it was set (the owner's policy)", () => {
  async function ready() {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    return cal;
  }

  it('is never sent, nor recorded, even though its Appointment has not started', async () => {
    const { core, clock, sender, store } = await ready();
    // At 3:00 pm on Thursday, a Reminder for 9:00 am that morning.
    await core.addAppointment(linda, {
      ...checkUp,
      reminders: [{ shape: 'at', date: '2026-11-19', time: '09:00' }],
    });
    await core.runDue();
    clock.set('2026-11-20T18:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    expect(store.texts()).toEqual([]);
  });

  it('is not one set for the very moment it is set: that one is due, and goes out', async () => {
    const { core, sender, store } = await ready();
    // At 3:00 pm on Thursday, a Reminder for 3:00 pm on Thursday.
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [{ shape: 'at', date: '2026-11-19', time: '15:00' }],
    });
    expect(added.reminders[0].dueAt).toBe(added.reminders[0].setAt);
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
    expect(store.texts()).toMatchObject([{ status: 'sent' }]);
  });

  it('is told apart from one that was due later and became overdue while it waited', async () => {
    const { core, clock, sender } = await ready();
    await core.addAppointment(linda, {
      ...checkUp,
      reminders: [
        { shape: 'at', date: '2026-11-19', time: '09:00' }, // already past
        { shape: 'at', date: '2026-11-19', time: '16:00' }, // still to come
      ],
    });
    clock.set('2026-11-20T15:00:00.000Z'); // the runs missed 4:00 pm; it is now 10:00 am Friday
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
  });

  it('keeps that difference through an edit that leaves its time alone', async () => {
    const { core, clock, sender, store } = await ready();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [
        { shape: 'at', date: '2026-11-19', time: '09:00' },
        { shape: 'at', date: '2026-11-19', time: '16:00' },
      ],
    });
    const [past, toCome] = added.reminders;
    clock.set('2026-11-20T14:00:00.000Z');
    // A note is added on Friday morning, keeping both Reminders as they are.
    const edited = await core.changeAppointment(mark, added.id, {
      noteForSusan: 'Bring your glasses.',
      // The Reminders as the form sends them back: each with its ID, unchanged.
      reminders: added.reminders.map(
        ({ id, dueAt: _dueAt, needsReview: _n, setAt: _s, ...timing }) => ({
          id,
          ...timing,
        }),
      ) as ReminderSetting[],
    });
    expect(edited.reminders.map((r) => r.setAt)).toEqual([past.setAt, toCome.setAt]);
    clock.set('2026-11-20T15:00:00.000Z');
    await core.runDue();
    expect(store.texts().map((text) => text.reminderId)).toEqual([toCome.id]);
    expect(sender.taken()[0].words).toMatch(/Bring your glasses/);
  });

  it('is worked out afresh when its Appointment moves it', async () => {
    const { core, clock, sender } = await ready();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [{ shape: 'before', amount: 2, unit: 'hours' }],
    });
    clock.set('2026-11-20T17:30:00.000Z'); // 12:30 pm Friday
    // Moved to 1:00 pm, so "2 hours before" is 11:00 am: already past when the move set it.
    const moved = await core.changeAppointment(mark, added.id, { time: '13:00' });
    expect(moved.reminders[0].setAt).toBe('2026-11-20T17:30:00.000Z');
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    // Moved again, to 3:00 pm: the Reminder is due at 1:00 pm, still to come.
    await core.changeAppointment(mark, added.id, { time: '15:00' });
    clock.set('2026-11-20T18:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
  });

  it('is set again when a person changes it or confirms it after review', async () => {
    const { core, clock } = await ready();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [{ shape: 'at', date: '2026-11-20', time: '09:00' }],
    });
    expect(added.reminders[0].setAt).toBe('2026-11-19T20:00:00.000Z');
    clock.set('2026-11-19T21:00:00.000Z');
    const moved = await core.changeAppointment(mark, added.id, { time: '15:00' });
    // An exact time stays put when the Appointment moves, so when it was set stays put too.
    expect(moved.reminders[0]).toMatchObject({
      needsReview: true,
      setAt: '2026-11-19T20:00:00.000Z',
    });
    clock.set('2026-11-19T22:00:00.000Z');
    const [reminder] = moved.reminders;
    const confirmed = await core.changeAppointment(mark, added.id, {
      reminders: [
        { id: reminder.id, shape: 'at', date: '2026-11-20', time: '09:00', reviewed: true },
      ],
    });
    expect(confirmed.reminders[0]).toMatchObject({
      needsReview: false,
      setAt: '2026-11-19T22:00:00.000Z',
    });
  });
});

describe('Reminders kept before the calendar recorded when each was set', () => {
  /** An Appointment as ticket 07 kept it: its Reminders have no record of when they were set. */
  async function kept(
    store: ReturnType<typeof calendar>['store'],
    details: { date: string; time: string; startsAt: string; dueAt: string; at: string },
  ): Promise<Appointment> {
    const appointment: Appointment = {
      id: crypto.randomUUID(),
      what: 'Eye exam',
      date: details.date,
      time: details.time,
      startsAt: details.startsAt,
      withWhom: null,
      placeName: null,
      placeAddress: null,
      driverName: null,
      pickupTime: null,
      noteForSusan: null,
      privateNotes: null,
      state: 'active',
      reminders: [
        {
          id: crypto.randomUUID(),
          shape: 'before',
          amount: 1,
          unit: 'hours',
          dueAt: details.dueAt,
          needsReview: false,
          setAt: null,
        },
      ],
      added: { personId: linda.person.id, personName: 'Linda', viaAgent: false, at: details.at },
      lastChanged: null,
    };
    await store.addAppointment(appointment);
    return appointment;
  }

  async function ready() {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    return cal;
  }

  it('are sent when their time comes, as any other', async () => {
    const { core, clock, sender, store } = await ready();
    await kept(store, {
      date: '2026-11-20',
      time: '14:00',
      startsAt: '2026-11-20T19:00:00.000Z',
      dueAt: '2026-11-20T18:00:00.000Z',
      at: '2026-11-18T15:00:00.000Z',
    });
    clock.set('2026-11-20T18:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
  });

  it("are taken to have been set at their Appointment's last save", async () => {
    const { core, sender, store } = await ready();
    // Added on Wednesday, with a Reminder that was already past then.
    await kept(store, {
      date: '2026-11-20',
      time: '14:00',
      startsAt: '2026-11-20T19:00:00.000Z',
      dueAt: '2026-11-18T12:00:00.000Z',
      at: '2026-11-18T15:00:00.000Z',
    });
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    expect(store.texts()).toEqual([]);
  });

  it("are sent when their time was the very moment of their Appointment's last save", async () => {
    const { core, clock, sender, store } = await ready();
    await kept(store, {
      date: '2026-11-20',
      time: '14:00',
      startsAt: '2026-11-20T19:00:00.000Z',
      dueAt: '2026-11-18T15:00:00.000Z',
      at: '2026-11-18T15:00:00.000Z',
    });
    clock.set('2026-11-19T20:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
  });

  it('are let go unrecorded once their Appointment has started: nothing was sending then', async () => {
    const { core, sender, store } = await ready();
    await kept(store, {
      date: '2026-11-17',
      time: '10:00',
      startsAt: '2026-11-17T15:00:00.000Z',
      dueAt: '2026-11-17T14:00:00.000Z',
      at: '2026-11-16T15:00:00.000Z',
    });
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    expect(store.texts()).toEqual([]);
  });

  it('keep when they were set through an edit that leaves their time alone', async () => {
    const { core, clock, sender, store } = await ready();
    const appointment = await kept(store, {
      date: '2026-11-20',
      time: '14:00',
      startsAt: '2026-11-20T19:00:00.000Z',
      dueAt: '2026-11-20T18:00:00.000Z',
      at: '2026-11-18T15:00:00.000Z',
    });
    // The runs miss 1:00 pm; at 1:10 pm someone adds a note.
    clock.set('2026-11-20T18:10:00.000Z');
    const edited = await core.changeAppointment(mark, appointment.id, { noteForSusan: 'Glasses.' });
    expect(edited.reminders[0].setAt).toBe('2026-11-18T15:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
  });
});

describe('a test text', () => {
  it('is refused while her number is not set, and nothing is recorded', async () => {
    const { core, store } = calendar();
    const refusal = await refused(core.sendTestText(linda), 'noNumber');
    expect(refusal.message).toMatch(/mobile number/);
    expect(store.texts()).toEqual([]);
  });

  it('goes out at once by the same path, and is recorded with its status', async () => {
    const { core, sender, store } = calendar();
    await core.changeSettings(linda, { susansNumber: '(555) 555-0123' });
    const text = await core.sendTestText(mark);
    expect(text).toMatchObject({ kind: 'test', appointmentId: null, status: 'sent' });
    expect(sender.taken()).toEqual([{ to: SUSANS_NUMBER, words: text.words }]);
    expect(text.words).toMatch(/^Susan's Calendar: This is a test text/);
    expect(store.texts()).toEqual([text]);
    expect(store.activity()).toEqual([]);
  });

  it('is tried again by the scheduled run when nobody can tell whether it went', async () => {
    const { core, clock, sender, store } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    sender.breakNext();
    expect(await core.sendTestText(linda)).toMatchObject({ status: 'waiting', attempts: 1 });
    clock.set('2026-11-19T20:02:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ kind: 'test', status: 'sent', attempts: 2 }]);
  });

  it('shows as failed when the sender refuses it', async () => {
    const { core, sender } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    sender.refuseNext();
    expect(await core.sendTestText(linda)).toMatchObject({ status: 'failed', reason: 'refused' });
  });
});

describe('the settings for texts', () => {
  it("keep Susan's number however it is typed, and the contact for the automatic answer", async () => {
    const { core, store } = calendar();
    const changed = await core.changeSettings(mark, {
      susansNumber: '555.555.0123',
      contactName: '  Linda  ',
      contactPhone: '+1 (555) 555-0187',
    });
    expect(changed).toEqual({
      susansNumber: SUSANS_NUMBER,
      contactName: 'Linda',
      contactPhone: '+15555550187',
      lastChanged: {
        personId: 'person-mark',
        personName: 'Mark',
        viaAgent: false,
        at: '2026-11-19T20:00:00.000Z',
      },
    });
    expect(await store.settings()).toEqual(changed);
  });

  it('change only what is given, and clear what is sent empty', async () => {
    const { core } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER, contactName: 'Linda' });
    const changed = await core.changeSettings(mark, { contactName: '' });
    expect(changed).toMatchObject({ susansNumber: SUSANS_NUMBER, contactName: null });
  });

  it('refuse a number that is not a US number, without repeating it', async () => {
    const { core, store } = calendar();
    for (const typed of [
      '555-0123',
      '1234567890',
      '+44 20 7946 0958',
      'call Linda',
      '555555012345',
    ]) {
      const refusal = await refused(core.changeSettings(linda, { susansNumber: typed }), 'invalid');
      expect(refusal.detail).toBe('susansNumber');
      expect(refusal.message).not.toContain(typed);
    }
    await refused(core.changeSettings(linda, { contactPhone: '12' }), 'invalid');
    await refused(core.changeSettings(linda, { contactName: 'x'.repeat(81) }), 'invalid');
    expect((await store.settings()).susansNumber).toBeNull();
  });

  it('do nothing when nothing changes, and leave no activity record', async () => {
    const { core, clock, store } = calendar();
    const first = await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    clock.set('2026-11-19T21:00:00.000Z');
    expect(await core.changeSettings(mark, { susansNumber: '555 555 0123' })).toEqual(first);
    expect(store.activity()).toEqual([]);
  });
});

describe('Change notices', () => {
  /**
   * Susan's number set, and an Appointment tomorrow (Friday) at 2:00 pm with Dr. Patel, whose
   * Reminder the evening before (Thursday 6:00 pm) has gone to her phone.
   */
  async function reminded(details: Partial<NewAppointment> = {}) {
    const cal = calendar();
    const added = await cal.core.addAppointment(linda, { ...everyDetail, ...details });
    await remind(cal, added);
    expect(cal.sender.taken()).toHaveLength(1);
    return { ...cal, added };
  }

  /** Runs what is due at a moment, given as an ISO timestamp. */
  async function runAt({ core, clock }: ReturnType<typeof calendar>, at: string) {
    clock.set(at);
    return core.runDue();
  }

  /** The words of every Change notice that went to her phone, oldest first. */
  const notices = ({ sender }: ReturnType<typeof calendar>) =>
    sender
      .taken()
      .map((text) => text.words)
      .filter((words) => words.includes('Change:'));

  it('tells her when an Appointment she was reminded of moves, with the old and new time', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z'); // 6:10 pm
    await cal.core.changeAppointment(mark, cal.added.id, { date: '2026-11-23', time: '10:00' });
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    expect(notices(cal)).toEqual([
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel has moved from tomorrow at 2:00 pm to Monday, November 23 at 10:00 am.",
    ]);
    expect(cal.sender.taken().at(-1)?.to).toBe(SUSANS_NUMBER);
  });

  it('tells her when an Appointment she was reminded of is cancelled', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.cancelAppointment(mark, cal.added.id);
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    expect(notices(cal)).toEqual([
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel, tomorrow at 2:00 pm, is cancelled.",
    ]);
  });

  it('records each one like a Reminder: its kind, Appointment, words, due time, status and what it told her', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { time: '15:00' });
    await runAt(cal, '2026-11-19T23:15:30.000Z');
    const notice = cal.store.texts().find((text) => text.kind === 'changeNotice');
    expect(notice).toEqual({
      id: expect.any(String),
      kind: 'changeNotice',
      appointmentId: cal.added.id,
      reminderId: null,
      words: notices(cal)[0],
      dueAt: '2026-11-19T23:15:00.000Z',
      status: 'sent',
      reason: null,
      attempts: 1,
      triedAt: '2026-11-19T23:15:30.000Z',
      sentAt: '2026-11-19T23:15:30.000Z',
      reference: expect.any(String),
      told: { date: '2026-11-20', time: '15:00', cancelled: false },
    });
    expect(JSON.stringify(cal.store.texts())).not.toMatch(/5555550123|prescription/);
    // It is about the Appointment, so deleting it is refused like after any text.
    await refused(cal.core.deleteAppointment(linda, cal.added.id), 'texted');
  });

  it('sends nothing about a move or a cancellation before any text about the Appointment went out', async () => {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const moving = await cal.core.addAppointment(linda, everyDetail);
    const going = await cal.core.addAppointment(linda, { ...checkUp, what: 'Blood draw' });
    await cal.core.changeAppointment(mark, moving.id, { date: '2026-11-23' });
    await cal.core.cancelAppointment(mark, going.id);
    await runAt(cal, '2026-11-19T20:30:00.000Z');
    await runAt(cal, '2026-11-19T22:00:00.000Z');
    expect(cal.sender.taken()).toEqual([]);
    expect(cal.store.texts()).toEqual([]);
  });

  it('sends nothing when no text about it can have reached her: none sent, or refused outright', async () => {
    const cal = calendar();
    const unsent = await cal.core.addAppointment(linda, everyDetail);
    const refusedOne = await cal.core.addAppointment(linda, { ...checkUp, what: 'Blood draw' });
    // No number yet when the first Reminders come due; then one is refused.
    await runAt(cal, '2026-11-19T23:00:00.000Z');
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    await cal.core.changeAppointment(linda, refusedOne.id, {
      reminders: [{ shape: 'before', amount: 2, unit: 'hours' }],
    });
    cal.sender.refuseNext();
    await runAt(cal, '2026-11-20T17:00:00.000Z');
    cal.clock.set('2026-11-20T17:05:00.000Z');
    await cal.core.changeAppointment(mark, unsent.id, { time: '16:00' });
    await cal.core.cancelAppointment(mark, refusedOne.id);
    await runAt(cal, '2026-11-20T17:30:00.000Z');
    expect(cal.sender.taken()).toEqual([]);
    expect(cal.store.texts().map((text) => text.kind)).toEqual([
      'reminder',
      'reminder',
      'reminder',
    ]);
  });

  it.each([
    [
      'moved',
      (core: CalendarCore, id: string) => core.changeAppointment(mark, id, { time: '16:00' }),
    ],
    ['cancelled', (core: CalendarCore, id: string) => core.cancelAppointment(mark, id)],
  ])(
    'sends nothing when it is %s after a run claimed its Reminder and stopped before sending',
    async (_, edit) => {
      const cal = calendar();
      await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
      const added = await cal.core.addAppointment(linda, everyDetail);
      const [reminder] = added.reminders;
      // What a run that stopped after its claim leaves: tried once, never handed to the sender.
      await cal.store.claimText({
        id: `reminder:${added.id}:${reminder.id}:${reminder.dueAt}`,
        kind: 'reminder',
        appointmentId: added.id,
        reminderId: reminder.id,
        words: reminderWords(added, reminder, EASTERN),
        dueAt: reminder.dueAt,
        status: 'waiting',
        reason: null,
        attempts: 1,
        triedAt: reminder.dueAt,
        sentAt: null,
        reference: null,
        told: { date: added.date, time: added.time, cancelled: false },
      });
      cal.clock.set('2026-11-19T23:00:30.000Z');
      await edit(cal.core, added.id);
      for (const at of ['23:02', '23:06', '23:30']) await runAt(cal, `2026-11-19T${at}:00.000Z`);
      // A move leaves that Reminder's time as it was, so it is tried again with the new details;
      // a cancellation gives it up. Either way she was never told of it, so no notice.
      expect(notices(cal)).toEqual([]);
      expect(cal.store.texts().map((text) => text.kind)).toEqual(['reminder']);
    },
  );

  it('sends nothing after a Reminder whose only try had no answer', async () => {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await cal.core.addAppointment(linda, everyDetail);
    cal.sender.breakNext();
    await runAt(cal, '2026-11-19T23:00:00.000Z');
    cal.clock.set('2026-11-19T23:01:00.000Z');
    await cal.core.cancelAppointment(mark, added.id);
    for (const at of ['23:02', '23:06', '23:30']) await runAt(cal, `2026-11-19T${at}:00.000Z`);
    expect(cal.sender.taken()).toEqual([]);
    expect(cal.store.texts()).toMatchObject([{ kind: 'reminder', status: 'failed' }]);
  });

  it('counts a Reminder the sender took on a second try as one she was told', async () => {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await cal.core.addAppointment(linda, everyDetail);
    cal.sender.breakNext();
    await runAt(cal, '2026-11-19T23:00:00.000Z');
    await runAt(cal, '2026-11-19T23:02:00.000Z');
    expect(cal.store.texts()).toMatchObject([{ status: 'sent', attempts: 2 }]);
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.cancelAppointment(mark, added.id);
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    expect(notices(cal)).toEqual([
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel, tomorrow at 2:00 pm, is cancelled.",
    ]);
  });

  it('describes the net change in one notice after several edits in a row', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { time: '15:00' });
    cal.clock.set('2026-11-19T23:12:00.000Z');
    await cal.core.changeAppointment(linda, cal.added.id, { time: '16:00' });
    cal.clock.set('2026-11-19T23:14:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { noteForSusan: 'Bring your glasses.' });
    // Five minutes after the first edit is not five minutes after the last: still settling.
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    await runAt(cal, '2026-11-19T23:18:00.000Z');
    expect(notices(cal)).toEqual([]);
    await runAt(cal, '2026-11-19T23:19:00.000Z');
    await runAt(cal, '2026-11-19T23:30:00.000Z');
    expect(notices(cal)).toEqual([
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel has moved from tomorrow at 2:00 pm to tomorrow at 4:00 pm.",
    ]);
  });

  it('sends nothing when an edit is put back before the notice goes out', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { date: '2026-11-21', time: '09:00' });
    cal.clock.set('2026-11-19T23:13:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { date: '2026-11-20', time: '14:00' });
    for (const at of ['23:15', '23:18', '23:30']) await runAt(cal, `2026-11-19T${at}:00.000Z`);
    expect(notices(cal)).toEqual([]);
    expect(cal.store.texts().map((text) => text.kind)).toEqual(['reminder']);
  });

  it('compares against what she was last told, so a later move is told from the time she last heard', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { date: '2026-11-23', time: '10:00' });
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    cal.clock.set('2026-11-19T23:40:00.000Z');
    await cal.core.changeAppointment(linda, cal.added.id, { date: '2026-11-24', time: '11:00' });
    await runAt(cal, '2026-11-19T23:45:00.000Z');
    // Put back to what her last notice said: nothing more to tell her.
    cal.clock.set('2026-11-20T00:10:00.000Z');
    await cal.core.changeAppointment(linda, cal.added.id, { date: '2026-11-23', time: '10:00' });
    cal.clock.set('2026-11-20T00:12:00.000Z');
    await cal.core.changeAppointment(linda, cal.added.id, { date: '2026-11-24', time: '11:00' });
    await runAt(cal, '2026-11-20T00:20:00.000Z');
    cal.clock.set('2026-11-20T00:30:00.000Z');
    await cal.core.cancelAppointment(mark, cal.added.id);
    await runAt(cal, '2026-11-20T00:35:00.000Z');
    await runAt(cal, '2026-11-20T01:00:00.000Z');
    expect(notices(cal)).toEqual([
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel has moved from tomorrow at 2:00 pm to Monday, November 23 at 10:00 am.",
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel has moved from Monday, November 23 at 10:00 am to Tuesday, November 24 at 11:00 am.",
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel, Tuesday, November 24 at 11:00 am, is cancelled.",
    ]);
  });

  it('sends nothing for a change to the place, Driver, pickup time or notes; later Reminders carry them', async () => {
    const cal = await reminded({
      reminders: [
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'before', amount: 2, unit: 'hours' },
      ],
    });
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, {
      placeName: 'Riverside Clinic',
      placeAddress: '12 River Rd',
      driverName: 'Mark',
      pickupTime: '13:00',
      noteForSusan: 'Bring your glasses.',
      privateNotes: 'Parking is at the back.',
    });
    await runAt(cal, '2026-11-19T23:30:00.000Z');
    expect(notices(cal)).toEqual([]);
    await runAt(cal, '2026-11-20T17:00:00.000Z'); // noon Friday: the second Reminder
    expect(cal.sender.taken().at(-1)?.words).toBe(
      "Susan's Calendar: Cardiology check-up with Dr. Patel, today at 2:00 pm, at Riverside Clinic, 12 River Rd. Mark picks you up at 1:00 pm. Bring your glasses.",
    );
  });

  it('sends each notice once, however many runs see it, even when they overlap', async () => {
    const cal = await reminded();
    const other = createCalendarCore({
      store: cal.store,
      clock: cal.clock,
      messenger: createMemoryMessenger(),
      textSender: cal.sender,
      timeZone: EASTERN,
    });
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { time: '15:00' });
    cal.clock.set('2026-11-19T23:15:00.000Z');
    await Promise.all([cal.core.runDue(), other.runDue(), cal.core.runDue()]);
    await runAt(cal, '2026-11-19T23:16:00.000Z');
    await runAt(cal, '2026-11-19T23:40:00.000Z');
    expect(notices(cal)).toHaveLength(1);
    expect(cal.store.texts().filter((text) => text.kind === 'changeNotice')).toHaveLength(1);
  });

  it('tries again a notice that might not have gone through', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { time: '15:00' });
    cal.sender.breakNext();
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    expect(cal.store.texts().at(-1)).toMatchObject({ kind: 'changeNotice', status: 'waiting' });
    await runAt(cal, '2026-11-19T23:16:00.000Z');
    await runAt(cal, '2026-11-19T23:17:00.000Z');
    expect(cal.store.texts().at(-1)).toMatchObject({ status: 'sent', attempts: 2 });
    expect(notices(cal)).toHaveLength(1);
  });

  it('gives up a waiting notice that a later edit made wrong, and tells her the outcome from what she last heard', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { time: '15:00' });
    cal.sender.breakNext();
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    cal.clock.set('2026-11-19T23:16:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { time: '16:00' });
    await runAt(cal, '2026-11-19T23:17:00.000Z');
    await runAt(cal, '2026-11-19T23:21:00.000Z');
    const kept = cal.store.texts().filter((text) => text.kind === 'changeNotice');
    expect(kept.map((text) => [text.status, text.reason])).toEqual([
      ['failed', 'outdated'],
      ['sent', null],
    ]);
    // The sender never took the first, so the second is told from the Reminder she was sent.
    expect(notices(cal)).toEqual([
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel has moved from tomorrow at 2:00 pm to tomorrow at 4:00 pm.",
    ]);
  });

  it('records a notice as not sent while her number is not set, and sends none of them later', async () => {
    const cal = await reminded();
    await cal.core.changeSettings(linda, { susansNumber: null });
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { time: '15:00' });
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    await runAt(cal, '2026-11-19T23:30:00.000Z');
    expect(notices(cal)).toEqual([]);
    expect(cal.store.texts().at(-1)).toMatchObject({
      kind: 'changeNotice',
      status: 'notSent',
      reason: 'noNumber',
    });
  });

  it('sends nothing, and records nothing, for an edit made once both the old and new times had passed', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-21T15:00:00.000Z'); // Saturday: the Appointment was yesterday
    await cal.core.changeAppointment(mark, cal.added.id, { time: '15:00' });
    await runAt(cal, '2026-11-21T15:10:00.000Z');
    expect(notices(cal)).toEqual([]);
    expect(cal.store.texts().map((text) => text.kind)).toEqual(['reminder']);
  });

  it('records a notice as not sent when the run reaches it only after both times have passed', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { time: '13:00' });
    // No run between the edit and the Appointment's old time.
    await runAt(cal, '2026-11-20T19:30:00.000Z');
    expect(notices(cal)).toEqual([]);
    expect(cal.store.texts().at(-1)).toMatchObject({
      kind: 'changeNotice',
      status: 'notSent',
      reason: 'tooLate',
    });
  });

  it('pays no heed to a text recorded before the calendar kept what each one told her', async () => {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await cal.core.addAppointment(linda, everyDetail);
    await cal.store.claimText({
      id: `reminder:${added.id}:${added.reminders[0].id}:${added.reminders[0].dueAt}`,
      kind: 'reminder',
      appointmentId: added.id,
      reminderId: added.reminders[0].id,
      words: reminderWords(added, added.reminders[0], EASTERN),
      dueAt: added.reminders[0].dueAt,
      status: 'sent',
      reason: null,
      attempts: 1,
      triedAt: added.reminders[0].dueAt,
      sentAt: added.reminders[0].dueAt,
      reference: null,
      told: null,
    });
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, added.id, { time: '15:00' });
    await runAt(cal, '2026-11-19T23:30:00.000Z');
    expect(cal.sender.taken()).toEqual([]);
  });

  it('keeps to the basic text-message characters where it can', async () => {
    const cal = await reminded({ what: 'Dr. O’Brien’s check-up', withWhom: null });
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.cancelAppointment(mark, cal.added.id);
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    expect(notices(cal)).toEqual([
      "Susan's Calendar: Change: Dr. O'Brien's check-up, tomorrow at 2:00 pm, is cancelled.",
    ]);
  });
});

describe('Reminders for a moved Appointment', () => {
  it('a Reminder that already went out is due again at its new time, after the notice', async () => {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await cal.core.addAppointment(linda, {
      ...everyDetail,
      reminders: [{ shape: 'before', amount: 2, unit: 'hours' }],
    });
    cal.clock.set('2026-11-20T17:00:00.000Z'); // noon Friday
    await cal.core.runDue();
    cal.clock.set('2026-11-20T17:30:00.000Z');
    await cal.core.changeAppointment(mark, added.id, { time: '17:00' });
    for (const at of ['17:35', '19:59', '20:00', '20:30']) {
      cal.clock.set(`2026-11-20T${at}:00.000Z`);
      await cal.core.runDue();
    }
    expect(cal.sender.taken().map((text) => text.words)).toEqual([
      "Susan's Calendar: Cardiology check-up with Dr. Patel, today at 2:00 pm, at Heart Clinic, 400 Main St. Linda picks you up at 1:15 pm. Bring your list of medicines.",
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel has moved from today at 2:00 pm to today at 5:00 pm.",
      "Susan's Calendar: Cardiology check-up with Dr. Patel, today at 5:00 pm, at Heart Clinic, 400 Main St. Linda picks you up at 1:15 pm. Bring your list of medicines.",
    ]);
  });
});

describe('a Change notice that comes up overnight', () => {
  type Calendar = ReturnType<typeof calendar>;

  /** Reminded of the Appointment, then an edit at 10:00 pm on Thursday, Susan's time. */
  async function lateEdit(
    details: Partial<NewAppointment>,
    edit: (cal: Calendar, id: string) => Promise<unknown>,
  ) {
    const cal = calendar();
    const added = await cal.core.addAppointment(linda, { ...everyDetail, ...details });
    await remind(cal, added);
    cal.clock.set('2026-11-20T03:00:00.000Z'); // 10:00 pm Thursday
    await edit(cal, added.id);
    return cal;
  }

  async function runAt({ core, clock }: Calendar, at: string) {
    clock.set(at);
    return core.runDue();
  }

  const sentAt = (cal: Calendar) =>
    cal.store.texts().find((text) => text.kind === 'changeNotice')?.sentAt;

  it('waits until 7:00 am when both the old and new times are later', async () => {
    const cal = await lateEdit({}, ({ core }, id) =>
      core.changeAppointment(mark, id, { time: '15:00' }),
    );
    for (const at of ['2026-11-20T03:05', '2026-11-20T08:00', '2026-11-20T11:59'])
      await runAt(cal, `${at}:00.000Z`);
    expect(sentAt(cal)).toBeUndefined();
    await runAt(cal, '2026-11-20T12:00:00.000Z'); // 7:00 am Friday
    expect(sentAt(cal)).toBe('2026-11-20T12:00:00.000Z');
    expect(cal.sender.taken().at(-1)?.words).toBe(
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel has moved from today at 2:00 pm to today at 3:00 pm.",
    );
  });

  it('waits until 7:00 am for a cancellation too', async () => {
    const cal = await lateEdit({}, ({ core }, id) => core.cancelAppointment(mark, id));
    await runAt(cal, '2026-11-20T03:05:00.000Z');
    expect(sentAt(cal)).toBeUndefined();
    await runAt(cal, '2026-11-20T12:00:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T12:00:00.000Z');
  });

  it('waits when it is due just after 9:00 pm', async () => {
    const cal = calendar();
    const added = await cal.core.addAppointment(linda, everyDetail);
    await remind(cal, added);
    cal.clock.set('2026-11-20T01:58:00.000Z'); // 8:58 pm: settled at 9:03 pm
    await cal.core.changeAppointment(mark, added.id, { time: '15:00' });
    await runAt(cal, '2026-11-20T02:03:00.000Z');
    expect(sentAt(cal)).toBeUndefined();
    await runAt(cal, '2026-11-20T12:00:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T12:00:00.000Z');
  });

  it('goes at once when the new time is before 7:00 am', async () => {
    const cal = await lateEdit({}, ({ core }, id) =>
      core.changeAppointment(mark, id, { time: '06:30', pickupTime: null }),
    );
    await runAt(cal, '2026-11-20T03:05:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T03:05:00.000Z');
    expect(cal.sender.taken().at(-1)?.words).toBe(
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel has moved from tomorrow at 2:00 pm to tomorrow at 6:30 am.",
    );
  });

  it('goes at once when the old time is before 7:00 am', async () => {
    const cal = await lateEdit({ time: '06:30', pickupTime: null }, ({ core }, id) =>
      core.changeAppointment(mark, id, { time: '10:00' }),
    );
    await runAt(cal, '2026-11-20T03:05:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T03:05:00.000Z');
  });

  it('goes at once for the cancellation of an Appointment before 7:00 am', async () => {
    const cal = await lateEdit({ time: '06:30', pickupTime: null }, ({ core }, id) =>
      core.cancelAppointment(mark, id),
    );
    await runAt(cal, '2026-11-20T03:05:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T03:05:00.000Z');
  });

  it('waits when the new time is 7:00 am itself: that is not before then', async () => {
    const cal = await lateEdit({}, ({ core }, id) =>
      core.changeAppointment(mark, id, { time: '07:00', pickupTime: null }),
    );
    await runAt(cal, '2026-11-20T03:05:00.000Z');
    expect(sentAt(cal)).toBeUndefined();
    await runAt(cal, '2026-11-20T12:00:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T12:00:00.000Z');
  });

  it("counts the night in Susan's time zone, not the machine's or US Eastern", async () => {
    // In Los Angeles that moment is 7:00 pm, not overnight: the notice goes once settled.
    const cal = calendar('America/Los_Angeles');
    const added = await cal.core.addAppointment(linda, everyDetail);
    await remind(cal, added);
    cal.clock.set('2026-11-20T03:00:00.000Z');
    await cal.core.changeAppointment(mark, added.id, { time: '15:00' });
    await runAt(cal, '2026-11-20T03:05:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T03:05:00.000Z');
  });
});
