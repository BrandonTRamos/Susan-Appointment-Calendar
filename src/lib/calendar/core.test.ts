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
  reminderHoldsWebAddress,
  remindersStillToSend,
  reminderWords,
  upcomingAppointments,
  type Actor,
  type Appointment,
  type MemoryStore,
  type NewAppointment,
  type NewSeries,
  type ReminderSetting,
  type TextKind,
  holdsWebAddress,
  NO_TEXT_SENDER,
  ALERT_ATTEMPTS,
  type MemoryMessenger,
  reminderTextId,
  textTrouble,
  type Text,
  STATUS_READS_AT_ONCE,
  TEXT_KINDS,
  TEST_TEXT_WORDS,
  type CalendarCore,
} from './index';

const EASTERN = 'America/New_York';
const HOUR = 60 * 60_000;

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
    expect(remindersStillToSend(added, now, EASTERN).map((r) => r.dueAt)).toEqual([
      '2026-11-20T01:00:00.000Z',
      '2026-11-20T17:00:00.000Z',
    ]);
    const cancelled = await core.cancelAppointment(linda, added.id);
    expect(remindersStillToSend(cancelled, now, EASTERN)).toEqual([]);
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
    expect(remindersStillToSend(moved, now, EASTERN).map((r) => r.dueAt)).toEqual([
      '2026-11-20T18:00:00.000Z',
    ]);
  });

  it('leave out one whose words hold a web address, which is never sent', async () => {
    const { core, clock, sender, store } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await core.addAppointment(linda, {
      ...checkUp,
      noteForSusan: 'Check in at example.de',
      reminders: [thursdayAtEight, twoHoursBefore],
    });
    const now = new Date('2026-11-19T20:00:00.000Z');
    expect(added.reminders.map((r) => reminderHoldsWebAddress(added, r, EASTERN))).toEqual([
      true,
      true,
    ]);
    expect(remindersStillToSend(added, now, EASTERN)).toEqual([]);
    // The same check the run makes: when they come due, neither is sent.
    for (const reminder of added.reminders) {
      clock.set(reminder.dueAt);
      await core.runDue();
    }
    expect(sender.taken()).toEqual([]);
    expect(store.texts().map((text) => text.reason)).toEqual(['webAddress', 'webAddress']);
    // Taking the address out puts them back.
    const fixed = await core.changeAppointment(linda, added.id, { noteForSusan: 'Check in first' });
    expect(remindersStillToSend(fixed, now, EASTERN)).toHaveLength(2);
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

describe('agent keys', () => {
  it('keeps only a hash of a key, so it is seen in full only when made', async () => {
    const { core, store } = calendar();
    const made = await core.makeAgentKey(linda, '  Claude   on my laptop ');
    expect(made.key).toMatch(/^sc_agent_[A-Za-z0-9_-]{43}$/);
    expect(made).toMatchObject({ name: 'Claude on my laptop', madeAt: '2026-11-19T20:00:00.000Z' });
    expect(store.agentKeys()).toEqual([
      {
        hash: made.hash,
        personId: 'person-linda',
        name: 'Claude on my laptop',
        madeAt: made.madeAt,
      },
    ]);
    expect(made.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(store.agentKeys())).not.toContain(made.key);
  });

  it("answers whose a key is, for that person's agent to act as them", async () => {
    const { core } = calendar();
    const lindas = await core.makeAgentKey(linda, 'Laptop');
    const marks = await core.makeAgentKey(mark, 'Phone');
    expect(await core.agentKeyOwner(lindas.key)).toBe('person-linda');
    expect(await core.agentKeyOwner(marks.key)).toBe('person-mark');
  });

  it('answers nothing for a key that is wrong, revoked or not a key at all, alike', async () => {
    const { core } = calendar();
    const { key, hash } = await core.makeAgentKey(linda, 'Laptop');
    const other = await core.makeAgentKey(linda, 'Phone');
    await core.revokeAgentKey(linda, hash);
    expect(await core.agentKeyOwner(key)).toBeNull();
    const wrong = key.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    for (const notOne of [wrong, '', 'sc_agent_', null, 42, { key: other.key }, `${other.key}x`])
      expect(await core.agentKeyOwner(notOne)).toBeNull();
    // Revoking one key leaves the person's others working.
    expect(await core.agentKeyOwner(other.key)).toBe('person-linda');
  });

  it("is each person's own: nobody can revoke someone else's key", async () => {
    const { core, store } = calendar();
    const lindas = await core.makeAgentKey(linda, 'Laptop');
    await core.revokeAgentKey(mark, lindas.hash);
    expect(await core.agentKeyOwner(lindas.key)).toBe('person-linda');
    expect(store.agentKeys()).toMatchObject([{ personId: 'person-linda' }]);
    // Revoking a key that is already gone changes nothing.
    await core.revokeAgentKey(linda, lindas.hash);
    await core.revokeAgentKey(linda, lindas.hash);
    expect(store.agentKeys()).toEqual([]);
  });

  it('can be several for one person, each with a name to tell them apart', async () => {
    const { core, store } = calendar();
    await core.makeAgentKey(susan, 'Laptop');
    await core.makeAgentKey(susan, 'Phone');
    expect(
      store
        .agentKeys()
        .map((key) => key.name)
        .sort(),
    ).toEqual(['Laptop', 'Phone']);
    await refused(core.makeAgentKey(susan, '   '), 'invalid');
    await refused(core.makeAgentKey(susan, 'x'.repeat(61)), 'invalid');
    await refused(core.makeAgentKey(susan, 42), 'invalid');
  });

  it('cannot be made or revoked by an agent', async () => {
    const { core } = calendar();
    const { key, hash } = await core.makeAgentKey(linda, 'Laptop');
    await refused(core.makeAgentKey(lindasAgent, 'Another'), 'invalid');
    await refused(core.revokeAgentKey(lindasAgent, hash), 'invalid');
    expect(await core.agentKeyOwner(key)).toBe('person-linda');
  });

  it('is no Activity record and no Activity update: the Appointments did not change', async () => {
    const { core, store, messenger } = calendar();
    const { hash } = await core.makeAgentKey(linda, 'Laptop');
    await core.revokeAgentKey(linda, hash);
    expect(store.activity()).toEqual([]);
    expect(messenger.appNotifications()).toEqual([]);
  });
});

describe('reading the calendar through the core, as an agent does', () => {
  it('gives every Appointment in date order, cancelled ones too, and one by its ID', async () => {
    const { core } = calendar();
    const later = await core.addAppointment(linda, { ...checkUp, date: '2026-11-25' });
    const sooner = await core.addAppointment(mark, everyDetail);
    await core.cancelAppointment(mark, later.id);
    expect((await core.appointments()).map((each) => [each.id, each.state])).toEqual([
      [sooner.id, 'active'],
      [later.id, 'cancelled'],
    ]);
    expect(await core.appointment(sooner.id)).toEqual(sooner);
    await refused(core.appointment('no-such-appointment'), 'missing');
  });

  it('gives every Series, and one by its ID', async () => {
    const { core } = calendar();
    const { series } = await core.addSeries(linda, {
      what: 'Dialysis',
      date: '2026-11-23',
      time: '09:00',
      repeat: { every: 'week', weekdays: [0, 3] },
    });
    expect(await core.everySeries()).toEqual([series]);
    expect(await core.series(series.id)).toEqual(series);
    await refused(core.series('no-such-series'), 'missing');
  });

  it('gives the texts about an Appointment, in the order they were due', async () => {
    const cal = calendar();
    const { core, clock } = cal;
    const added = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'before', amount: 2, unit: 'hours' },
      ],
    });
    await core.addAppointment(linda, { ...checkUp, what: 'Hair' });
    await remind(cal, added);
    clock.set(added.reminders[1].dueAt);
    await core.runDue();
    const texts = await core.textsAbout(added.id);
    expect(texts.map((text) => [text.kind, text.dueAt, text.status])).toEqual([
      ['reminder', added.reminders[0].dueAt, 'sent'],
      ['reminder', added.reminders[1].dueAt, 'sent'],
    ]);
    await refused(core.textsAbout('no-such-appointment'), 'missing');
  });
});

describe('a Series', () => {
  /** Dialysis every Monday and Thursday at 9:00 am, from Monday 23 November. */
  const dialysis: NewSeries = {
    what: 'Dialysis',
    date: '2026-11-23',
    time: '09:00',
    placeName: 'Riverside Dialysis',
    driverName: 'Linda',
    repeat: { every: 'week', weekdays: [0, 3] },
  };

  /** The Appointments in a Series, in date order. */
  const inSeries = (store: MemoryStore, seriesId: string) =>
    store.appointments().filter((appointment) => appointment.series?.id === seriesId);
  const datesOf = (appointments: Appointment[]) => appointments.map(({ date }) => date);

  describe('repeats', () => {
    it('weekly on chosen weekdays, each one a real Appointment with its own Reminders', async () => {
      const { core, store } = calendar();
      const { series, appointments } = await core.addSeries(linda, dialysis);
      expect(datesOf(appointments).slice(0, 5)).toEqual([
        '2026-11-23',
        '2026-11-26',
        '2026-11-30',
        '2026-12-03',
        '2026-12-07',
      ]);
      expect(store.appointments()).toEqual(appointments);
      for (const appointment of appointments) {
        expect(appointment).toMatchObject({
          what: 'Dialysis',
          time: '09:00',
          placeName: 'Riverside Dialysis',
          driverName: 'Linda',
          state: 'active',
          series: {
            id: series.id,
            date: appointment.date,
            repeat: { every: 'week', interval: 1, weekdays: [0, 3] },
            individuallyChanged: false,
          },
          added: { personName: 'Linda' },
        });
        // Each starts with the Reminder every new Appointment starts with: the day before at 6 pm.
        expect(appointment.reminders).toMatchObject([
          { shape: 'daysBefore', days: 1, time: '18:00' },
        ]);
      }
      expect(series).toMatchObject({
        what: 'Dialysis',
        starts: '2026-11-23',
        ends: null,
        reminders: [{ shape: 'daysBefore', days: 1, time: '18:00' }],
      });
    });

    it('every N weeks', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, {
        ...dialysis,
        date: '2026-11-24',
        repeat: { every: 'week', interval: 2, weekdays: [1] },
      });
      expect(datesOf(appointments).slice(0, 4)).toEqual([
        '2026-11-24',
        '2026-12-08',
        '2026-12-22',
        '2027-01-05',
      ]);
    });

    it('every N weeks on several weekdays keeps to the same weeks', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, {
        ...dialysis,
        date: '2026-11-25',
        repeat: { every: 'week', interval: 3, weekdays: [0, 2, 4] },
      });
      // From Wednesday 25 November: that week's Wednesday and Friday, then three weeks on.
      expect(datesOf(appointments).slice(0, 5)).toEqual([
        '2026-11-25',
        '2026-11-27',
        '2026-12-14',
        '2026-12-16',
        '2026-12-18',
      ]);
    });

    it('monthly on the day it starts, landing on the last day of a shorter month', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, {
        what: 'Check-up',
        date: '2026-12-31',
        time: '11:00',
        repeat: { every: 'month' },
      });
      expect(datesOf(appointments).slice(0, 5)).toEqual([
        '2026-12-31',
        '2027-01-31',
        '2027-02-28',
        '2027-03-31',
        '2027-04-30',
      ]);
      expect(appointments[0].series?.repeat).toEqual({ every: 'month', interval: 1, day: 31 });
    });

    it('every N months', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, {
        what: 'Eye exam',
        date: '2026-11-30',
        time: '15:30',
        repeat: { every: 'month', interval: 3 },
      });
      expect(datesOf(appointments)).toEqual(['2026-11-30', '2027-02-28', '2027-05-30']);
    });

    it('until the date it ends on, and no further', async () => {
      const { core, store } = calendar();
      const { series, appointments } = await core.addSeries(linda, {
        ...dialysis,
        ends: '2026-12-07',
      });
      expect(datesOf(appointments)).toEqual([
        '2026-11-23',
        '2026-11-26',
        '2026-11-30',
        '2026-12-03',
        '2026-12-07',
      ]);
      expect(series.ends).toBe('2026-12-07');
      expect(store.appointments()).toHaveLength(5);
    });

    it('with no end, made ahead as far as the rolling horizon', async () => {
      const { core } = calendar();
      const { series, appointments } = await core.addSeries(linda, dialysis);
      // 182 days after it starts, since it starts after today.
      expect(series.madeThrough).toBe('2027-05-24');
      expect(appointments.at(-1)?.date).toBe('2027-05-24');
      expect(appointments).toHaveLength(53);
    });

    it("keeps Susan's clock time across a clock change: a weekly 9:00 am stays at 9:00 am", async () => {
      const { core } = calendar();
      // The clocks go forward on Sunday 14 March 2027, and back on Sunday 7 November 2027.
      const { appointments } = await core.addSeries(linda, {
        what: 'Physio',
        date: '2027-03-08',
        time: '09:00',
        repeat: { every: 'week', weekdays: [0] },
      });
      const [before, after] = appointments;
      expect(before).toMatchObject({ date: '2027-03-08', time: '09:00' });
      expect(before.startsAt).toBe('2027-03-08T14:00:00.000Z');
      expect(after).toMatchObject({ date: '2027-03-15', time: '09:00' });
      expect(after.startsAt).toBe('2027-03-15T13:00:00.000Z');
      expect(appointments.every(({ time }) => time === '09:00')).toBe(true);
    });

    it('whatever time zone the machine is in, in the time zone it is configured with', async () => {
      const { core } = calendar('Europe/London');
      const { appointments } = await core.addSeries(linda, {
        what: 'Physio',
        date: '2027-03-22',
        time: '09:00',
        repeat: { every: 'week', weekdays: [0] },
      });
      // London's clocks go forward on 28 March 2027.
      expect(appointments[0].startsAt).toBe('2027-03-22T09:00:00.000Z');
      expect(appointments[1].startsAt).toBe('2027-03-29T08:00:00.000Z');
    });
  });

  describe('on the night the clocks go forward', () => {
    /** Every Sunday at 2:30 am from 7 March 2027; the clocks skip 2:00 to 3:00 am on 14 March. */
    const nightCheck: NewSeries = {
      what: 'Night check',
      date: '2027-03-07',
      time: '02:30',
      repeat: { every: 'week', weekdays: [6] },
      reminders: [{ shape: 'before', amount: 1, unit: 'hours' }],
    };
    const on = (appointments: Appointment[], date: string) =>
      appointments.find((appointment) => appointment.date === date)!;

    it('keeps an Appointment the clocks skip, moved on by their jump, and says so', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, nightCheck);
      const moved = on(appointments, '2027-03-14');
      expect(moved).toMatchObject({
        time: '03:30',
        startsAt: '2027-03-14T07:30:00.000Z',
        series: { date: '2027-03-14', shiftedFrom: '02:30', individuallyChanged: false },
      });
      // Its Reminders follow the start it has.
      expect(moved.reminders[0]).toMatchObject({
        dueAt: '2027-03-14T06:30:00.000Z',
        needsReview: false,
      });
      // The other dates keep the Series' own time.
      for (const date of ['2027-03-07', '2027-03-21', '2027-03-28'])
        expect(on(appointments, date)).toMatchObject({
          time: '02:30',
          series: { shiftedFrom: null },
        });
    });

    it('moves it on by the jump the zone has, such as half an hour', async () => {
      // Lord Howe Island's clocks go forward half an hour, from 2:00 to 2:30 am, on 3 October 2027.
      const { core } = calendar('Australia/Lord_Howe');
      const { appointments } = await core.addSeries(linda, {
        ...nightCheck,
        date: '2027-09-26',
        time: '02:15',
      });
      expect(on(appointments, '2027-10-03')).toMatchObject({
        time: '02:45',
        series: { shiftedFrom: '02:15' },
      });
      expect(on(appointments, '2027-10-10')).toMatchObject({ time: '02:15' });
    });

    it('moves it to the next day when the clocks jump across midnight', async () => {
      // Dhaka's clocks went forward an hour at 11:00 pm on Friday 19 June 2009, to midnight.
      const { core } = calendar('Asia/Dhaka');
      const { series, appointments } = await core.addSeries(linda, {
        what: 'Late check',
        date: '2009-06-12',
        time: '23:30',
        ends: '2009-07-03',
        repeat: { every: 'week', weekdays: [4] },
        reminders: [{ shape: 'daysBefore', days: 0, time: '22:30' }],
      });
      const moved = appointments.find(({ series: place }) => place?.date === '2009-06-19')!;
      // It is on the date and at the time it really starts, and keeps its place in the pattern.
      expect(moved).toMatchObject({
        id: `${series.id}-2009-06-19`,
        date: '2009-06-20',
        time: '00:30',
        startsAt: '2009-06-19T17:30:00.000Z',
        series: { date: '2009-06-19', shiftedFrom: '23:30' },
      });
      // Its same-day Reminder is worked out on the day it is on, which puts it after the start:
      // held, not refused, for the clocks did it.
      expect(moved.reminders).toMatchObject([
        { dueAt: '2009-06-20T15:30:00.000Z', needsReview: true },
      ]);
      for (const date of ['2009-06-12', '2009-06-26'])
        expect(appointments.find((a) => a.date === date)).toMatchObject({
          time: '23:30',
          reminders: [{ needsReview: false }],
          series: { shiftedFrom: null },
        });
    });

    it('a top-up cut short by an end on its date in the pattern keeps one moved past it', async () => {
      const { store, clock, messenger, sender } = calendar();
      let pause: (() => Promise<void>) | null = null;
      const pausing: MemoryStore = {
        ...store,
        async addAppointment(appointment) {
          const waiting = pause;
          pause = null;
          await waiting?.();
          return store.addAppointment(appointment);
        },
      };
      const timeZone = 'Asia/Dhaka';
      const core = createCalendarCore({
        store: pausing,
        clock,
        messenger,
        textSender: sender,
        timeZone,
      });
      // Every Friday and Saturday at 11:30 pm. Friday 19 June's moves to Saturday 20 June at 12:30 am.
      clock.set('2008-12-15T00:00:00.000Z');
      const { series } = await core.addSeries(linda, {
        what: 'Late check',
        date: '2008-12-12',
        time: '23:30',
        repeat: { every: 'week', weekdays: [4, 5] },
      });
      // 182 days after today, 15 December 2008.
      expect(series.madeThrough).toBe('2009-06-15');
      clock.set('2009-01-01T00:00:00.000Z');
      // While it runs, the Series is ended after Friday 19 June, its last date in the pattern.
      pause = async () => {
        const now = (await store.series(series.id))!;
        await store.replaceSeries({ ...now, ends: '2009-06-19' });
      };
      await core.topUpSeries();
      const kept = inSeries(store, series.id).filter(
        ({ series: place }) => place!.date > '2009-06-15',
      );
      // Friday 19 June's, though on the 20th, stays; Saturday 20 June's and the rest are taken out.
      expect(kept.map(({ date, time, series: place }) => [place!.date, date, time])).toEqual([
        ['2009-06-19', '2009-06-20', '00:30'],
      ]);
      expect(kept[0].state).toBe('active');
    });

    it('keeps it so when the Series is topped up', async () => {
      const { core, store, clock } = calendar();
      clock.set('2026-08-01T20:00:00.000Z');
      const { series } = await core.addSeries(linda, { ...nightCheck, date: '2026-08-02' });
      expect(inSeries(store, series.id).some(({ date }) => date === '2027-03-14')).toBe(false);
      clock.set('2027-01-10T20:00:00.000Z');
      await core.topUpSeries();
      const all = inSeries(store, series.id);
      expect(on(all, '2027-03-14')).toMatchObject({
        time: '03:30',
        series: { shiftedFrom: '02:30' },
      });
      expect(on(all, '2027-03-07')).toMatchObject({ time: '02:30' });
      expect(on(all, '2027-03-21')).toMatchObject({ time: '02:30' });
    });

    it('holds for review a Reminder the jump puts at its start, and not one just before', async () => {
      const { core } = calendar();
      // 3:30 am every Sunday: not a time the clocks skip, but Reminders at 2:30 and 2:29 am that
      // day are, so on 14 March they go out at 3:30 and 3:29 am.
      const { appointments } = await core.addSeries(linda, {
        ...nightCheck,
        time: '03:30',
        reminders: [
          { shape: 'daysBefore', days: 0, time: '02:30' },
          { shape: 'daysBefore', days: 0, time: '02:29' },
        ],
      });
      const that = on(appointments, '2027-03-14');
      expect(that).toMatchObject({ time: '03:30', series: { shiftedFrom: null } });
      expect(that.reminders).toMatchObject([
        { time: '02:29', dueAt: '2027-03-14T07:29:00.000Z', needsReview: false },
        { time: '02:30', dueAt: '2027-03-14T07:30:00.000Z', needsReview: true },
      ]);
      // On the other Sundays both go out before the start, as set.
      expect(on(appointments, '2027-03-21').reminders.every((r) => !r.needsReview)).toBe(true);
    });

    it('never sends a held Reminder, while the others go out', async () => {
      const cal = calendar();
      const { core, clock, sender, store } = cal;
      const { appointments } = await core.addSeries(linda, {
        ...nightCheck,
        time: '03:30',
        reminders: [dayBeforeAtSix, { shape: 'daysBefore', days: 0, time: '02:45' }],
      });
      const that = on(appointments, '2027-03-14');
      const held = that.reminders.find((reminder) => reminder.needsReview)!;
      expect(held).toMatchObject({ time: '02:45', dueAt: '2027-03-14T07:45:00.000Z' });
      await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
      for (const at of [
        '2027-03-13T23:00:00.000Z', // 6:00 pm the day before
        '2027-03-14T07:30:00.000Z', // the start
        '2027-03-14T07:45:00.000Z', // when the held one would go out
        '2027-03-14T09:00:00.000Z',
      ]) {
        clock.set(at);
        await core.runDue();
      }
      const about = store.texts().filter(({ appointmentId }) => appointmentId === that.id);
      expect(about.filter(({ status }) => status === 'sent')).toMatchObject([
        { reminderId: that.reminders.find((r) => !r.needsReview)!.id },
      ]);
      expect(
        about.some(({ reminderId, status }) => reminderId === held.id && status === 'sent'),
      ).toBe(false);
      expect(sender.taken()).toHaveLength(1);
    });

    it('still refuses such a start or Reminder entered for the first Appointment itself', async () => {
      const { core, store } = calendar();
      await refused(core.addSeries(linda, { ...nightCheck, date: '2027-03-14' }), 'invalid');
      const refusal = await refused(
        core.addSeries(linda, {
          ...nightCheck,
          date: '2027-03-14',
          time: '03:30',
          reminders: [{ shape: 'daysBefore', days: 0, time: '02:30' }],
        }),
        'invalid',
      );
      expect(refusal.detail).toBe('reminders');
      expect(store.appointments()).toEqual([]);
    });

    it('changing only that one keeps saying it was moved, unless its time is changed', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, nightCheck);
      const moved = on(appointments, '2027-03-14');
      const driven = await core.changeAppointment(mark, moved.id, { driverName: 'Mark' });
      expect(driven).toMatchObject({
        time: '03:30',
        series: { shiftedFrom: '02:30', individuallyChanged: true },
      });
      const retimed = await core.changeAppointment(mark, moved.id, { time: '04:00' });
      expect(retimed.series).toMatchObject({ shiftedFrom: null });
    });

    it('changing only that one leaves a held Reminder held, and refuses keeping it as it is', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, {
        ...nightCheck,
        time: '03:30',
        reminders: [{ shape: 'daysBefore', days: 0, time: '02:30' }],
      });
      const that = on(appointments, '2027-03-14');
      const driven = await core.changeAppointment(mark, that.id, { driverName: 'Mark' });
      expect(driven.reminders).toMatchObject([{ needsReview: true }]);
      const [held] = that.reminders;
      const refusal = await refused(
        core.changeAppointment(mark, that.id, {
          reminders: [{ shape: 'daysBefore', days: 0, time: '02:30', id: held.id, reviewed: true }],
        }),
        'invalid',
      );
      expect(refusal.message).toMatch(/after the Appointment starts/);
      // Moved to an earlier time, it is no longer held.
      const fixed = await core.changeAppointment(mark, that.id, {
        reminders: [{ shape: 'daysBefore', days: 0, time: '01:30', id: held.id }],
      });
      expect(fixed.reminders).toMatchObject([{ needsReview: false }]);
    });

    it('this and all later ones from it, changing another detail, keeps it moved and the rest regular', async () => {
      const { core, store } = calendar();
      const { appointments } = await core.addSeries(linda, nightCheck);
      const moved = on(appointments, '2027-03-14');
      const changed = await core.changeSeries(mark, moved.id, { driverName: 'Mark' });
      expect(changed).toMatchObject({
        id: moved.id,
        time: '03:30',
        driverName: 'Mark',
        series: { date: '2027-03-14', shiftedFrom: '02:30' },
      });
      expect(await store.series(changed.series!.id)).toMatchObject({
        starts: '2027-03-14',
        time: '02:30',
      });
      const later = inSeries(store, changed.series!.id);
      expect(
        later.slice(1).every(({ time, driverName }) => time === '02:30' && driverName === 'Mark'),
      ).toBe(true);
    });

    it('this and all later ones still refuses a Reminder entered too late on any day', async () => {
      const { core, store } = calendar();
      const { appointments } = await core.addSeries(linda, { ...nightCheck, time: '03:30' });
      const before = store.appointments();
      const first = on(appointments, '2027-03-07');
      // 4:00 am the same day is after a 3:30 am start every Sunday: refused, not held.
      const refusal = await refused(
        core.changeSeries(mark, first.id, {
          reminders: [{ shape: 'daysBefore', days: 0, time: '04:00' }],
        }),
        'invalid',
      );
      expect(refusal.detail).toBe('reminders');
      expect(store.appointments()).toEqual(before);
      // 2:30 am is before the start every Sunday but the one the clocks skip it: there it is held.
      const changed = await core.changeSeries(mark, first.id, {
        reminders: [{ shape: 'daysBefore', days: 0, time: '02:30' }],
      });
      const later = inSeries(store, changed.series!.id);
      expect(
        later.filter(({ reminders }) => reminders[0].needsReview).map(({ date }) => date),
      ).toEqual(['2027-03-14']);
    });

    it('this and all later ones with a start entered for that night is still refused', async () => {
      const { core, store } = calendar();
      const { appointments } = await core.addSeries(linda, nightCheck);
      const before = store.appointments();
      // The time typed for it: 2:15 am does not exist that night.
      await refused(
        core.changeSeries(mark, on(appointments, '2027-03-14').id, { time: '02:15' }),
        'invalid',
      );
      // The date typed for it, at the Series' 2:30 am.
      await refused(
        core.changeSeries(mark, on(appointments, '2027-03-07').id, { date: '2027-03-14' }),
        'invalid',
      );
      expect(store.appointments()).toEqual(before);
    });
  });

  describe('is refused, with nothing kept,', () => {
    it.each([
      ['without what it is', { ...dialysis, what: '' }, 'what'],
      ['without a start time', { ...dialysis, time: '' }, 'time'],
      ['without a pattern', { ...dialysis, repeat: undefined }, 'repeat'],
      ['with a pattern it does not have', { ...dialysis, repeat: { every: 'day' } }, 'repeat'],
      ['with no weekday', { ...dialysis, repeat: { every: 'week', weekdays: [] } }, 'repeat'],
      [
        'with a weekday that is not one',
        { ...dialysis, repeat: { every: 'week', weekdays: [0, 7] } },
        'repeat',
      ],
      [
        'with a gap that is not a whole number of weeks',
        { ...dialysis, repeat: { every: 'week', interval: 1.5, weekdays: [0] } },
        'repeat',
      ],
      [
        'with a gap of more than a year',
        { ...dialysis, repeat: { every: 'month', interval: 13 } },
        'repeat',
      ],
      [
        'when its first date is not a day it repeats on',
        { ...dialysis, repeat: { every: 'week', weekdays: [3] } },
        'repeat',
      ],
      ['when it ends before it starts', { ...dialysis, ends: '2026-11-22' }, 'ends'],
      ['when its end is not a date', { ...dialysis, ends: 'soon' }, 'ends'],
      [
        'when its start time is one the clocks skip on its first day',
        { ...dialysis, date: '2027-03-14', time: '02:30', repeat: { every: 'month' } },
        'time',
      ],
    ])('%s', async (_case, sent, detail) => {
      const { core, store } = calendar();
      const refusal = await refused(core.addSeries(linda, sent as unknown as NewSeries), 'invalid');
      expect(refusal.detail).toBe(detail);
      expect(store.appointments()).toEqual([]);
      expect(store.everySeriesKept()).toEqual([]);
      expect(store.activity()).toEqual([]);
    });

    it('when its first date is not a day it repeats on, saying which day it is', async () => {
      const { core } = calendar();
      const refusal = await refused(
        core.addSeries(linda, { ...dialysis, repeat: { every: 'week', weekdays: [1, 3] } }),
        'invalid',
      );
      expect(refusal.message).toMatch(/Monday/);
    });
  });

  describe('Reminders', () => {
    it('set on a Series apply to every Appointment in it', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, {
        ...dialysis,
        reminders: [dayBeforeAtSix, twoHoursBefore],
      });
      for (const appointment of appointments) {
        expect(appointment.reminders).toHaveLength(2);
        const [dayBefore, twoHours] = appointment.reminders;
        expect(dayBefore).toMatchObject({ shape: 'daysBefore', days: 1, time: '18:00' });
        expect(twoHours).toMatchObject({ shape: 'before', amount: 2, unit: 'hours' });
        expect(Date.parse(appointment.startsAt) - Date.parse(twoHours.dueAt)).toBe(2 * HOUR);
      }
    });

    it('can be none', async () => {
      const { core } = calendar();
      const { series, appointments } = await core.addSeries(linda, { ...dialysis, reminders: [] });
      expect(series.reminders).toEqual([]);
      expect(appointments.every((appointment) => appointment.reminders.length === 0)).toBe(true);
    });

    it('on a Series are gap-based only: an exact time is refused, naming the Reminder', async () => {
      const { core, store } = calendar();
      const refusal = await refused(
        core.addSeries(linda, { ...dialysis, reminders: [dayBeforeAtSix, thursdayAtEight] }),
        'invalid',
      );
      expect(refusal.detail).toBe('reminders');
      expect(refusal.message).toMatch(/^Reminder 2: /);
      expect(store.appointments()).toEqual([]);
    });

    it('on a Series that would go out after the start are refused', async () => {
      const { core } = calendar();
      const refusal = await refused(
        core.addSeries(linda, {
          ...dialysis,
          reminders: [{ shape: 'daysBefore', days: 0, time: '18:00' }],
        }),
        'invalid',
      );
      expect(refusal.message).toMatch(/after the Appointment starts/);
    });

    it('are set when each Appointment is made, by the rule for any Reminder', async () => {
      const { core, store, clock } = calendar();
      const { series, appointments } = await core.addSeries(linda, dialysis);
      for (const { reminders } of appointments)
        expect(reminders.every(({ setAt }) => setAt === '2026-11-19T20:00:00.000Z')).toBe(true);
      clock.set('2027-02-01T20:00:00.000Z');
      await core.topUpSeries();
      const topped = inSeries(store, series.id).filter(({ date }) => date > series.madeThrough);
      expect(topped.length).toBeGreaterThan(0);
      for (const { reminders } of topped)
        expect(reminders.every(({ setAt }) => setAt === '2027-02-01T20:00:00.000Z')).toBe(true);
    });

    it('whose time had passed when the Series was entered are never sent', async () => {
      const { core, store, clock, sender } = calendar();
      // Entered on Thursday afternoon, from that day: its Reminder, the evening before, had passed.
      const { appointments } = await core.addSeries(linda, {
        ...dialysis,
        date: '2026-11-19',
        time: '17:00',
        repeat: { every: 'week', weekdays: [3] },
      });
      await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
      clock.set('2026-11-19T20:30:00.000Z');
      await core.runDue();
      // Never sent, nor recorded, as for any Reminder past when it was set.
      expect(sender.taken()).toEqual([]);
      expect(
        store.texts().filter(({ appointmentId }) => appointmentId === appointments[0].id),
      ).toEqual([]);
    });

    it('changed with this and all later ones are set again when their time moves', async () => {
      const { core, store, clock } = calendar();
      // Two hours before: it moves with the start time. The day before at 6:00 pm would not.
      const { appointments } = await core.addSeries(linda, {
        ...dialysis,
        reminders: [twoHoursBefore],
      });
      clock.set('2026-11-20T15:00:00.000Z');
      const changed = await core.changeSeries(mark, appointments[2].id, { time: '10:00' });
      const later = inSeries(store, changed.series!.id);
      expect(
        later.every(({ reminders }) => reminders[0].setAt === '2026-11-20T15:00:00.000Z'),
      ).toBe(true);
      clock.set('2026-11-20T16:00:00.000Z');
      // A change that leaves their time alone leaves alone when they were set. (The changed Series
      // starts later, so it reaches a few days further; those new ones are set now.)
      const kept = new Set(later.map(({ id }) => id));
      const again = await core.changeSeries(mark, appointments[3].id, { driverName: 'Mark' });
      const now = inSeries(store, again.series!.id);
      expect(now.filter(({ id }) => kept.has(id)).length).toBeGreaterThan(40);
      for (const { id, reminders } of now)
        expect(reminders[0].setAt).toBe(
          kept.has(id) ? '2026-11-20T15:00:00.000Z' : '2026-11-20T16:00:00.000Z',
        );
    });

    it('an exact-time Reminder can still be added to one Appointment in a Series', async () => {
      const { core, store } = calendar();
      const { series, appointments } = await core.addSeries(linda, dialysis);
      const [, second] = appointments;
      const changed = await core.changeAppointment(mark, second.id, {
        reminders: [...second.reminders, { shape: 'at', date: '2026-11-26', time: '07:00' }],
      });
      expect(changed.reminders).toHaveLength(2);
      expect(changed.series?.individuallyChanged).toBe(true);
      const others = inSeries(store, series.id).filter(({ id }) => id !== second.id);
      expect(others.every((appointment) => appointment.reminders.length === 1)).toBe(true);
    });
  });

  it('adding one leaves one activity record, not one per Appointment', async () => {
    const { core, store } = calendar();
    const { series, appointments } = await core.addSeries(lindasAgent, dialysis);
    expect(store.activity()).toEqual([
      expect.objectContaining({
        action: 'added',
        personName: 'Linda',
        viaAgent: true,
        seriesId: series.id,
        appointmentId: appointments[0].id,
        what: 'Dialysis',
        date: '2026-11-23',
        time: '09:00',
      }),
    ]);
  });

  describe('Activity updates', () => {
    it('adding one tells the other Admins once, not once per Appointment', async () => {
      const { core, messenger } = calendar();
      const { appointments } = await core.addSeries(linda, dialysis);
      expect(appointments.length).toBeGreaterThan(1);
      expect(messenger.appNotifications()).toEqual([
        {
          to: ['person-mark', 'person-ann'],
          notification: expect.objectContaining({
            body: 'Linda added a Series: Dialysis, every week on Monday and Thursday at 9:00 am, from Mon, Nov 23, 2026.',
            opens: `/appointments/${appointments[0].id}`,
          }),
        },
      ]);
    });

    it('changing or cancelling this and all later ones tells them once each', async () => {
      const { core, messenger } = calendar();
      const { appointments } = await core.addSeries(linda, dialysis);
      await core.changeSeries(mark, appointments[2].id, { time: '10:00', ends: '2026-12-31' });
      await core.endSeries(lindasAgent, appointments[4].id);
      const [, changed, cancelled] = messenger.appNotifications();
      expect(messenger.appNotifications()).toHaveLength(3);
      expect(changed.to).toEqual(['person-linda', 'person-ann']);
      expect(changed.notification.body).toBe(
        'Mark changed Dialysis from Mon, Nov 30, 2026 on: now every week on Monday and Thursday at 10:00 am, until Thu, Dec 31, 2026.',
      );
      expect(cancelled.to).toEqual(['person-mark', 'person-ann']);
      expect(cancelled.notification.body).toBe(
        "Linda's agent cancelled Dialysis from Mon, Dec 7, 2026 on: this and all later ones.",
      );
    });

    it('changing only this one tells them as for any Appointment', async () => {
      const { core, messenger } = calendar();
      const { appointments } = await core.addSeries(linda, dialysis);
      await core.changeAppointment(mark, appointments[1].id, { time: '10:30' });
      expect(messenger.appNotifications()).toHaveLength(2);
      expect(messenger.appNotifications()[1].notification.body).toMatch(/^Mark changed Dialysis/);
    });

    it('topping up tells nobody: no app notification, Alert email or text', async () => {
      const { core, store, messenger, sender, clock } = calendar();
      await core.addSeries(linda, dialysis);
      await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
      clock.set('2027-02-01T20:00:00.000Z');
      await core.topUpSeries();
      expect(messenger.appNotifications()).toHaveLength(1);
      expect(messenger.emails()).toEqual([]);
      expect(sender.taken()).toEqual([]);
      expect(store.texts()).toEqual([]);
    });
  });

  it('a command on one Appointment leaves a record with no Series', async () => {
    const { core, store } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    expect(store.activity()).toMatchObject([{ appointmentId: id, seriesId: null }]);
  });

  it('an add that arrives twice with the same ID is carried out once', async () => {
    const { core, store } = calendar();
    const id = '6a1f7c3e-2b4d-4e8f-9a0b-1c2d3e4f5a6b';
    const first = await core.addSeries(linda, dialysis, id);
    const again = await core.addSeries(linda, dialysis, id);
    expect(again.series).toEqual(first.series);
    expect(datesOf(again.appointments)).toEqual(datesOf(first.appointments));
    expect(store.everySeriesKept()).toHaveLength(1);
    expect(store.appointments()).toHaveLength(first.appointments.length);
    expect(store.activity()).toHaveLength(1);
    await refused(core.addSeries(mark, dialysis, id), 'invalid');
  });

  describe('changing only this one', () => {
    it('changes that Appointment alone and marks it as individually changed', async () => {
      const { core, store } = calendar();
      const { series, appointments } = await core.addSeries(linda, dialysis);
      const [, second, third] = appointments;
      const changed = await core.changeAppointment(mark, second.id, {
        time: '10:30',
        driverName: 'Mark',
      });
      expect(changed).toMatchObject({
        time: '10:30',
        driverName: 'Mark',
        series: { id: series.id, date: '2026-11-26', individuallyChanged: true },
      });
      expect(store.appointments().find(({ id }) => id === third.id)).toEqual(third);
      expect(await store.series(series.id)).toEqual(series);
      expect(store.activity().at(-1)).toMatchObject({
        action: 'changed',
        appointmentId: second.id,
        seriesId: null,
      });
    });

    it('does not mark it when the change changes nothing', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, dialysis);
      const same = await core.changeAppointment(mark, appointments[0].id, { time: '09:00' });
      expect(same.series?.individuallyChanged).toBe(false);
    });

    it('cancels that Appointment alone, and marks it as individually changed', async () => {
      const { core, store } = calendar();
      const { series, appointments } = await core.addSeries(linda, dialysis);
      const cancelled = await core.cancelAppointment(mark, appointments[1].id);
      expect(cancelled).toMatchObject({
        state: 'cancelled',
        series: { individuallyChanged: true },
      });
      const rest = inSeries(store, series.id).filter(({ id }) => id !== cancelled.id);
      expect(rest.every(({ state }) => state === 'active')).toBe(true);
    });
  });

  describe('changing this and all later ones', () => {
    async function changing() {
      const setup = calendar();
      const { series, appointments } = await setup.core.addSeries(linda, dialysis);
      return { ...setup, series, appointments };
    }

    it('ends the Series at that point and continues it as a new Series with the new details', async () => {
      const { core, store, series, appointments } = await changing();
      const [first, second, third] = appointments;
      const changed = await core.changeSeries(mark, third.id, {
        time: '10:00',
        driverName: 'Mark',
      });

      // The earlier ones are as they were.
      const now = store.appointments();
      expect(now.find(({ id }) => id === first.id)).toEqual(first);
      expect(now.find(({ id }) => id === second.id)).toEqual(second);
      expect(await store.series(series.id)).toMatchObject({
        ends: '2026-11-29',
        lastChanged: { personName: 'Mark' },
      });

      // This one and the later ones are the new Series, at the new time with the new Driver.
      const newSeriesId = changed.series!.id;
      expect(newSeriesId).not.toBe(series.id);
      expect(await store.series(newSeriesId)).toMatchObject({
        starts: '2026-11-30',
        ends: null,
        time: '10:00',
        driverName: 'Mark',
        repeat: series.repeat,
        added: { personName: 'Mark' },
      });
      const later = inSeries(store, newSeriesId);
      expect(later[0].id).toBe(third.id);
      expect(datesOf(later).slice(0, 3)).toEqual(['2026-11-30', '2026-12-03', '2026-12-07']);
      expect(later.every(({ time, driverName }) => time === '10:00' && driverName === 'Mark')).toBe(
        true,
      );
      // 10:00 am Eastern, before the clocks go forward in March.
      expect(later[0].startsAt).toBe('2026-11-30T15:00:00.000Z');
      // The Reminders followed them to the new time.
      expect(later[0].reminders[0].dueAt).toBe('2026-11-29T23:00:00.000Z');
      expect(later[0].lastChanged).toMatchObject({ personName: 'Mark' });
      // Nothing is left in the old Series from that point on.
      expect(inSeries(store, series.id).map(({ id }) => id)).toEqual([first.id, second.id]);
    });

    it('replaces later ones, including ones individually changed', async () => {
      const { core, store, appointments } = await changing();
      const [, , third, fourth, fifth] = appointments;
      await core.changeAppointment(linda, fourth.id, { driverName: 'Ann', date: '2026-12-04' });
      await core.cancelAppointment(linda, fifth.id);

      const changed = await core.changeSeries(mark, third.id, { time: '10:00' });
      const later = inSeries(store, changed.series!.id);
      const onFourth = later.find(({ date }) => date === '2026-12-03');
      expect(onFourth).toMatchObject({
        id: fourth.id,
        time: '10:00',
        driverName: 'Linda',
        series: { individuallyChanged: false },
      });
      // The one cancelled on its own, of which Susan was never told, is replaced by a new one.
      expect(store.appointments().find(({ id }) => id === fifth.id)).toBeUndefined();
      expect(later.find(({ date }) => date === '2026-12-07')).toMatchObject({
        state: 'active',
        time: '10:00',
      });
    });

    it('drops an exact-time Reminder set on one of the later ones', async () => {
      const { core, store, appointments } = await changing();
      const [, , third] = appointments;
      await core.changeAppointment(linda, third.id, {
        reminders: [...third.reminders, { shape: 'at', date: '2026-11-30', time: '07:00' }],
      });
      await core.changeSeries(mark, third.id, { driverName: 'Mark' });
      expect(store.appointments().find(({ id }) => id === third.id)?.reminders).toMatchObject([
        { shape: 'daysBefore' },
      ]);
    });

    it('can change how it repeats, and when it ends, from that point', async () => {
      const setup = await changing();
      const { core, store, series, appointments } = setup;
      const [, , third, fourth] = appointments;
      // Susan was reminded of the Thursday after it: she has to hear it is off.
      await remind(setup, fourth);
      expect(store.texts().filter(({ status }) => status === 'sent')).toMatchObject([
        { appointmentId: fourth.id },
      ]);
      const changed = await core.changeSeries(mark, third.id, {
        date: '2026-12-01',
        repeat: { every: 'week', weekdays: [1, 4] },
        ends: '2026-12-31',
      });
      const later = inSeries(store, changed.series!.id);
      expect(datesOf(later)).toEqual([
        '2026-12-01',
        '2026-12-04',
        '2026-12-08',
        '2026-12-11',
        '2026-12-15',
        '2026-12-18',
        '2026-12-22',
        '2026-12-25',
        '2026-12-29',
      ]);
      // This one moved to the new first day.
      expect(later[0].id).toBe(third.id);
      // The later ones on days it no longer repeats on are gone, unless Susan was told of one: that
      // one is kept, cancelled.
      const old = inSeries(store, series.id);
      expect(old.map(({ id, state }) => [id, state])).toEqual([
        [appointments[0].id, 'active'],
        [appointments[1].id, 'active'],
        [fourth.id, 'cancelled'],
      ]);
      expect(await store.series(changed.series!.id)).toMatchObject({ ends: '2026-12-31' });
    });

    it('keeps on record a replaced one that Susan was texted about, with its texts', async () => {
      const setup = await changing();
      const { core, store, appointments } = setup;
      const [, , third, fourth] = appointments;
      await remind(setup, fourth);
      const textsBefore = store.texts().filter(({ appointmentId }) => appointmentId === fourth.id);
      await core.changeSeries(mark, third.id, { repeat: { every: 'week', weekdays: [0] } });
      expect(store.appointments().find(({ id }) => id === fourth.id)).toMatchObject({
        state: 'cancelled',
      });
      expect(store.texts().filter(({ appointmentId }) => appointmentId === fourth.id)).toEqual(
        textsBefore,
      );
      await refused(core.deleteAppointment(linda, fourth.id), 'texted');
    });

    it('can start the changed Series running with no end', async () => {
      const setup = calendar();
      const { appointments } = await setup.core.addSeries(linda, {
        ...dialysis,
        ends: '2026-12-31',
      });
      const changed = await setup.core.changeSeries(mark, appointments[2].id, { ends: null });
      expect(await setup.store.series(changed.series!.id)).toMatchObject({
        ends: null,
        // 182 days after the changed Series starts.
        madeThrough: '2027-05-31',
      });
    });

    it('can set Reminders for them, gap-based only', async () => {
      const { core, store, appointments } = await changing();
      const changed = await core.changeSeries(mark, appointments[2].id, {
        reminders: [twoHoursBefore],
      });
      const later = inSeries(store, changed.series!.id);
      expect(later.every(({ reminders }) => reminders.length === 1)).toBe(true);
      expect(later[0].reminders[0]).toMatchObject({ shape: 'before', amount: 2 });
      await refused(
        core.changeSeries(mark, appointments[3].id, { reminders: [thursdayAtEight] }),
        'invalid',
      );
    });

    it('leaves one activity record, not one per Appointment', async () => {
      const { core, store, appointments } = await changing();
      const changed = await core.changeSeries(mark, appointments[2].id, { time: '10:00' });
      expect(store.activity()).toHaveLength(2);
      expect(store.activity()[1]).toMatchObject({
        action: 'changed',
        personName: 'Mark',
        appointmentId: appointments[2].id,
        seriesId: changed.series!.id,
        date: '2026-11-30',
        time: '10:00',
      });
    });

    it('does nothing when it changes nothing', async () => {
      const { core, store, appointments } = await changing();
      const before = store.appointments();
      const same = await core.changeSeries(mark, appointments[2].id, { time: '09:00' });
      expect(same).toEqual(appointments[2]);
      expect(store.appointments()).toEqual(before);
      expect(store.everySeriesKept()).toHaveLength(1);
      expect(store.activity()).toHaveLength(1);
    });

    it('sent again after it was carried out changes nothing more', async () => {
      const { core, store, appointments } = await changing();
      await core.changeSeries(mark, appointments[2].id, { time: '10:00' });
      const after = store.appointments();
      await core.changeSeries(mark, appointments[2].id, { time: '10:00' });
      expect(store.appointments()).toEqual(after);
      expect(store.activity()).toHaveLength(2);
    });

    it('from the first one replaces the whole Series', async () => {
      const { core, store, series, appointments } = await changing();
      const changed = await core.changeSeries(mark, appointments[0].id, { time: '10:00' });
      expect(inSeries(store, series.id)).toEqual([]);
      expect(inSeries(store, changed.series!.id)).toHaveLength(appointments.length);
    });

    it('is refused, changing nothing, when it would put a Reminder at or after the start', async () => {
      const { core, store } = calendar();
      // 9:00 am, with a Reminder at 8:00 am the same day.
      const { appointments } = await core.addSeries(linda, {
        ...dialysis,
        reminders: [{ shape: 'daysBefore', days: 0, time: '08:00' }],
      });
      const before = {
        appointments: store.appointments(),
        series: store.everySeriesKept(),
        activity: store.activity(),
      };
      for (const time of ['08:00', '07:30']) {
        const refusal = await refused(
          core.changeSeries(mark, appointments[2].id, { time }),
          'invalid',
        );
        expect(refusal.detail).toBe('reminders');
        expect(refusal.message).toMatch(/after the Appointment starts/);
      }
      expect(store.appointments()).toEqual(before.appointments);
      expect(store.everySeriesKept()).toEqual(before.series);
      expect(store.activity()).toEqual(before.activity);
      // The same move with a Reminder that fits it is carried out.
      const moved = await core.changeSeries(mark, appointments[2].id, {
        time: '07:30',
        reminders: [{ shape: 'daysBefore', days: 0, time: '06:30' }],
      });
      expect(moved).toMatchObject({ time: '07:30' });
    });

    describe('cut off partway and sent again', () => {
      /**
       * A calendar whose store fails once, just after the Series write `failAfter` names (counted
       * from 1), as when the function stops partway through a command.
       */
      async function cutOff(
        failAfter: number,
        ends: string | null = '2027-01-31',
        write: 'replaceSeries' | 'replaceAppointment' = 'replaceSeries',
      ) {
        const { store, clock, messenger, sender } = calendar();
        let writes = 0;
        let failed = false;
        const failing: MemoryStore = {
          ...store,
          async [write](kept: never) {
            await (store[write] as (kept: never) => Promise<void>)(kept);
            if (!failed && ++writes === failAfter) {
              failed = true;
              throw new Error('The function stopped');
            }
          },
        };
        const timeZone = EASTERN;
        const core = createCalendarCore({
          store: failing,
          clock,
          messenger,
          textSender: sender,
          timeZone,
        });
        const { series, appointments } = await core.addSeries(linda, { ...dialysis, ends });
        return { core, store, series, appointments };
      }

      it('right after the old Series was given its new end, is carried out in full', async () => {
        const { core, store, series, appointments } = await cutOff(1);
        const [first, second, third] = appointments;
        await expect(core.changeSeries(mark, third.id, { time: '10:00' })).rejects.toThrow();
        const changed = await core.changeSeries(mark, third.id, { time: '10:00' });

        expect(changed).toMatchObject({ id: third.id, time: '10:00' });
        // It keeps the end the Series had, not the one it was cut back to.
        expect(await store.series(changed.series!.id)).toMatchObject({
          starts: '2026-11-30',
          ends: '2027-01-31',
        });
        expect(await store.series(series.id)).toMatchObject({ ends: '2026-11-29' });
        expect(inSeries(store, series.id).map(({ id }) => id)).toEqual([first.id, second.id]);
        const later = inSeries(store, changed.series!.id);
        expect(later.at(-1)?.date).toBe('2027-01-28');
        expect(later.every(({ time }) => time === '10:00')).toBe(true);
        const active = store.appointments().filter(({ state }) => state === 'active');
        expect(new Set(datesOf(active)).size).toBe(active.length);
        // One activity record for the change, as for one never cut off.
        expect(store.activity().filter(({ action }) => action === 'changed')).toHaveLength(1);
      });

      it('partway through moving the later ones, is carried out in full', async () => {
        const { core, store, series, appointments } = await cutOff(
          3,
          '2027-01-31',
          'replaceAppointment',
        );
        const [first, second, third] = appointments;
        await expect(core.changeSeries(mark, third.id, { time: '10:00' })).rejects.toThrow();
        const changed = await core.changeSeries(mark, third.id, { time: '10:00' });
        expect(inSeries(store, series.id).map(({ id }) => id)).toEqual([first.id, second.id]);
        const later = inSeries(store, changed.series!.id);
        expect(later[0].id).toBe(third.id);
        expect(later.at(-1)?.date).toBe('2027-01-28');
        expect(later.every(({ time }) => time === '10:00')).toBe(true);
        const active = store.appointments().filter(({ state }) => state === 'active');
        expect(new Set(datesOf(active)).size).toBe(active.length);
        expect(store.activity().filter(({ action }) => action === 'changed')).toHaveLength(1);
      });

      it('keeps a Series with no end running with none', async () => {
        const { core, store, appointments } = await cutOff(1, null);
        await expect(
          core.changeSeries(mark, appointments[2].id, { time: '10:00' }),
        ).rejects.toThrow();
        const changed = await core.changeSeries(mark, appointments[2].id, { time: '10:00' });
        expect(await store.series(changed.series!.id)).toMatchObject({ ends: null });
      });

      it('cancelling this and all later ones, is carried out in full', async () => {
        const { core, store, series, appointments } = await cutOff(1);
        await expect(core.endSeries(mark, appointments[2].id)).rejects.toThrow();
        await core.endSeries(mark, appointments[2].id);
        const states = inSeries(store, series.id).map(({ state }) => state);
        expect(states.slice(0, 2)).toEqual(['active', 'active']);
        expect(states.slice(2).every((state) => state === 'cancelled')).toBe(true);
      });
    });

    it('from an earlier one, after a later split, replaces the later split too', async () => {
      const { core, store, series, appointments } = await changing();
      const [first, second, , fourth] = appointments;
      const split = await core.changeSeries(mark, fourth.id, { time: '10:00' });
      const changed = await core.changeSeries(mark, second.id, { driverName: 'Mark' });
      expect(inSeries(store, series.id).map(({ id }) => id)).toEqual([first.id]);
      // Every later one is in the new Series, once each, with its details: the later split's
      // own change is replaced, as one changed on its own would be.
      const active = store.appointments().filter(({ state }) => state === 'active');
      expect(new Set(datesOf(active)).size).toBe(active.length);
      expect(active.slice(1).every(({ series: place }) => place?.id === changed.series!.id)).toBe(
        true,
      );
      expect(
        active.slice(1).every(({ time, driverName }) => time === '09:00' && driverName === 'Mark'),
      ).toBe(true);
      expect(inSeries(store, split.series!.id)).toEqual([]);
      // The later split makes nothing more.
      expect((await store.series(split.series!.id))!.ends! < '2026-11-26').toBe(true);
    });

    it('cancelling from an earlier one, after a later split, cancels the later split too', async () => {
      const { core, store, appointments } = await changing();
      const [, second, , fourth] = appointments;
      const split = await core.changeSeries(mark, fourth.id, { time: '10:00' });
      await core.endSeries(mark, second.id);
      const active = store.appointments().filter(({ state }) => state === 'active');
      expect(active.map(({ id }) => id)).toEqual([appointments[0].id]);
      expect((await store.series(split.series!.id))!.ends! < '2026-11-26').toBe(true);
    });

    it('is refused for an Appointment not in a Series, a cancelled one, or one not there', async () => {
      const { core, store, appointments } = await changing();
      const { id } = await core.addAppointment(linda, checkUp);
      await refused(core.changeSeries(mark, id, { time: '10:00' }), 'invalid');
      await core.cancelAppointment(linda, appointments[4].id);
      await refused(core.changeSeries(mark, appointments[4].id, { time: '10:00' }), 'cancelled');
      await refused(core.changeSeries(mark, 'no-such-appointment', { time: '10:00' }), 'missing');
      await refused(core.changeSeries(mark, appointments[2].id, { what: '' }), 'invalid');
      await refused(core.changeSeries(mark, appointments[2].id, { ends: '2026-11-01' }), 'invalid');
      expect(store.everySeriesKept()).toHaveLength(1);
    });
  });

  describe('cancelling this and all later ones', () => {
    it('ends the Series there, and cancels this one and the later ones, keeping them', async () => {
      const { core, store } = calendar();
      const { series, appointments } = await core.addSeries(linda, dialysis);
      const [first, second, third] = appointments;
      const cancelled = await core.endSeries(mark, third.id);
      expect(cancelled).toMatchObject({ id: third.id, state: 'cancelled' });
      const kept = inSeries(store, series.id);
      expect(kept).toHaveLength(appointments.length);
      expect(kept.slice(0, 2)).toEqual([first, second]);
      expect(kept.slice(2).every(({ state }) => state === 'cancelled')).toBe(true);
      expect(kept[2].lastChanged).toMatchObject({ personName: 'Mark' });
      expect(await store.series(series.id)).toMatchObject({ ends: '2026-11-29' });
      expect(store.activity()).toHaveLength(2);
      expect(store.activity()[1]).toMatchObject({
        action: 'cancelled',
        appointmentId: third.id,
        seriesId: series.id,
      });
    });

    it('is refused for an Appointment not in a Series, or one already cancelled', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, dialysis);
      const { id } = await core.addAppointment(linda, checkUp);
      await refused(core.endSeries(mark, id), 'invalid');
      await core.cancelAppointment(mark, appointments[1].id);
      await refused(core.endSeries(mark, appointments[1].id), 'cancelled');
    });
  });

  describe('topping up', () => {
    it('makes the Appointments of a Series with no end as the horizon moves on', async () => {
      const { core, store, clock } = calendar();
      const { series, appointments } = await core.addSeries(linda, dialysis);
      clock.set('2027-02-01T20:00:00.000Z');
      await core.topUpSeries();
      const all = inSeries(store, series.id);
      // 182 days after 1 February 2027.
      expect(all.at(-1)?.date).toBe('2027-08-02');
      expect(datesOf(all).slice(0, appointments.length)).toEqual(datesOf(appointments));
      expect(new Set(datesOf(all)).size).toBe(all.length);
      expect(all.every(({ time, state }) => time === '09:00' && state === 'active')).toBe(true);
      expect(all.at(-1)).toMatchObject({
        series: { id: series.id },
        added: series.added,
        reminders: [{ shape: 'daysBefore', days: 1, time: '18:00' }],
      });
      expect(await store.series(series.id)).toMatchObject({ madeThrough: '2027-08-02' });
    });

    it('leaves no activity record: nobody changed the calendar', async () => {
      const { core, store, clock } = calendar();
      await core.addSeries(linda, dialysis);
      clock.set('2027-02-01T20:00:00.000Z');
      await core.topUpSeries();
      expect(store.activity()).toHaveLength(1);
    });

    it('run twice, or with nothing to make, makes nothing more', async () => {
      const { core, store, clock } = calendar();
      await core.addSeries(linda, dialysis);
      await core.topUpSeries();
      const made = store.appointments();
      clock.set('2027-02-01T20:00:00.000Z');
      await Promise.all([core.topUpSeries(), core.topUpSeries()]);
      const topped = store.appointments();
      await core.topUpSeries();
      expect(store.appointments()).toEqual(topped);
      expect(topped.length).toBeGreaterThan(made.length);
      expect(new Set(topped.map(({ date }) => date)).size).toBe(topped.length);
    });

    it('never makes one past the end, or past the point a Series was ended', async () => {
      const { core, store, clock } = calendar();
      const ending = await core.addSeries(linda, { ...dialysis, ends: '2027-06-30' });
      const ended = await core.addSeries(linda, {
        ...dialysis,
        what: 'Physio',
        repeat: { every: 'week', weekdays: [0] },
      });
      await core.endSeries(mark, ended.appointments[3].id);
      clock.set('2027-03-01T20:00:00.000Z');
      await core.topUpSeries();
      expect(inSeries(store, ending.series.id).at(-1)?.date).toBe('2027-06-28');
      expect(inSeries(store, ended.series.id)).toHaveLength(ended.appointments.length);
    });

    describe('while the Series is ended or split at the same moment', () => {
      /**
       * Two cores over one calendar, as the commands function and the top-up are: `pause` runs
       * a command partway through the top-up's first new Appointment, or partway through a
       * command's reading of the Appointments.
       */
      async function overlapping() {
        const { core, store, clock, messenger, sender } = calendar();
        const pauses: { add?: () => Promise<unknown>; read?: () => Promise<unknown> } = {};
        const toppingUp: MemoryStore = {
          ...store,
          async addAppointment(appointment) {
            const pause = pauses.add;
            pauses.add = undefined;
            await pause?.();
            return store.addAppointment(appointment);
          },
        };
        const commanding: MemoryStore = {
          ...store,
          async everyAppointment() {
            const all = await store.everyAppointment();
            const pause = pauses.read;
            pauses.read = undefined;
            await pause?.();
            return all;
          },
        };
        const timeZone = EASTERN;
        const options = { clock, messenger, textSender: sender, timeZone };
        const topUp = createCalendarCore({ ...options, store: toppingUp });
        const commands = createCalendarCore({ ...options, store: commanding });
        const { series, appointments } = await core.addSeries(linda, dialysis);
        clock.set('2027-02-01T20:00:00.000Z');
        return { store, series, appointments, pauses, topUp, commands };
      }

      /** Active Appointments a Series has after its end. */
      const pastTheEnd = async (store: MemoryStore, seriesId: string) => {
        const { ends } = (await store.series(seriesId))!;
        return inSeries(store, seriesId).filter(
          ({ date, state }) => ends !== null && date > ends && state === 'active',
        );
      };

      it('ended while the top-up is making Appointments: none is left after the end', async () => {
        const { store, series, appointments, pauses, topUp, commands } = await overlapping();
        pauses.add = () => commands.endSeries(mark, appointments[3].id);
        await topUp.topUpSeries();
        expect(await store.series(series.id)).toMatchObject({ ends: '2026-12-02' });
        expect(await pastTheEnd(store, series.id)).toEqual([]);
      });

      it('split while the top-up is making Appointments: none is left after the end', async () => {
        const { store, series, appointments, pauses, topUp, commands } = await overlapping();
        pauses.add = () => commands.changeSeries(mark, appointments[3].id, { time: '10:00' });
        await topUp.topUpSeries();
        expect(await pastTheEnd(store, series.id)).toEqual([]);
        // Each date has one Appointment: the new Series' own.
        const active = store.appointments().filter(({ state }) => state === 'active');
        expect(new Set(datesOf(active)).size).toBe(active.length);
      });

      it('topped up once a split has read the Appointments: none is left after the end', async () => {
        const { store, series, appointments, pauses, topUp, commands } = await overlapping();
        pauses.read = () => topUp.topUpSeries();
        await commands.changeSeries(mark, appointments[3].id, { time: '10:00' });
        expect(await pastTheEnd(store, series.id)).toEqual([]);
        const active = store.appointments().filter(({ state }) => state === 'active');
        expect(new Set(datesOf(active)).size).toBe(active.length);
      });

      it('topped up once an end has read the Appointments: none is left after the end', async () => {
        const { store, series, appointments, pauses, topUp, commands } = await overlapping();
        pauses.read = () => topUp.topUpSeries();
        await commands.endSeries(mark, appointments[3].id);
        expect(await pastTheEnd(store, series.id)).toEqual([]);
      });

      it('keeps the end that was set while it ran', async () => {
        const { store, series, appointments, pauses, topUp, commands } = await overlapping();
        pauses.add = () => commands.endSeries(mark, appointments[3].id);
        await topUp.topUpSeries();
        await topUp.topUpSeries();
        expect(await store.series(series.id)).toMatchObject({ ends: '2026-12-02' });
        expect(await pastTheEnd(store, series.id)).toEqual([]);
      });
    });

    it('does not bring back one that was deleted', async () => {
      const { core, store, clock } = calendar();
      const { series, appointments } = await core.addSeries(linda, dialysis);
      await core.deleteAppointment(linda, appointments[1].id);
      clock.set('2027-02-01T20:00:00.000Z');
      await core.topUpSeries();
      expect(datesOf(inSeries(store, series.id))).not.toContain('2026-11-26');
    });

    it("keeps to Susan's clock time across a clock change", async () => {
      const { core, store, clock } = calendar();
      const { series } = await core.addSeries(linda, dialysis);
      clock.set('2027-10-01T20:00:00.000Z');
      await core.topUpSeries();
      const all = inSeries(store, series.id);
      const before = all.find(({ date }) => date === '2027-11-04');
      const after = all.find(({ date }) => date === '2027-11-08');
      expect(before?.startsAt).toBe('2027-11-04T13:00:00.000Z');
      expect(after?.startsAt).toBe('2027-11-08T14:00:00.000Z');
    });
  });

  describe('Appointments in a Series', () => {
    it('can each be deleted on their own when entered by mistake', async () => {
      const { core, store } = calendar();
      const { series, appointments } = await core.addSeries(linda, dialysis);
      await core.deleteAppointment(mark, appointments[0].id);
      expect(inSeries(store, series.id)).toHaveLength(appointments.length - 1);
    });

    it('show in the calendar subscription like any other', async () => {
      const { core } = calendar();
      await core.addSeries(linda, { ...dialysis, ends: '2026-11-26' });
      const { secret } = await core.makeSubscriptionLink(linda);
      const feed = await core.subscriptionFeed(secret);
      expect(feed?.match(/SUMMARY:Dialysis/g)).toHaveLength(2);
    });
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
        // The stand-in names no text: nobody can be asked what became of it.
        reference: null,
        creditLeft: null,
        told: { date: '2026-11-20', time: '14:00', cancelled: false },
        alert: null,
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

  it('counts a text refused when tried again as maybe sent: the first try may have gone', async () => {
    const { core, clock, sender, store, added } = await ready();
    sender.breakNext();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    // Tried again, it is refused, as when the credit ran out in between.
    sender.refuseNext();
    clock.set('2026-11-19T23:02:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'refused', attempts: 2 }]);
    await refused(core.deleteAppointment(mark, added.id), 'texted');
  });

  it('can still delete an Appointment whose only text was refused on its only try', async () => {
    const { core, clock, sender, added } = await ready();
    sender.refuseNext();
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    await core.deleteAppointment(mark, added.id);
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
      creditLeft: null,
      told: { date: added.date, time: added.time, cancelled: false },
      alert: null,
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
        delivery: sender.delivery,
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
        delivery: sender.delivery,
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
      series: null,
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

describe('Alerts', () => {
  /** Every Alert delivery so far, by channel: who each went to, in order, and in what words. */
  const alerts = (messenger: ReturnType<typeof calendar>['messenger']) => ({
    emails: messenger.emails().flatMap(({ to, email }) => to.map((id) => ({ to: id, email }))),
    notifications: messenger
      .appNotifications()
      .filter(({ notification }) => notification.tag.startsWith('alert-'))
      .flatMap(({ to, notification }) => to.map((id) => ({ to: id, notification }))),
  });
  /** Who each channel reached, in order. */
  const reached = (messenger: ReturnType<typeof calendar>['messenger']) => {
    const { emails, notifications } = alerts(messenger);
    return { email: emails.map((each) => each.to), app: notifications.map((each) => each.to) };
  };
  const EVERY_ADMIN = { email: ADMINS, app: ADMINS };

  /** A calendar with Susan's number set and the check-up tomorrow at 2:00 pm, its Reminder due. */
  async function ready(details: Partial<NewAppointment> = {}) {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await cal.core.addAppointment(mark, { ...everyDetail, ...details });
    cal.clock.set(added.reminders[0].dueAt); // 6:00 pm, the day before
    return { ...cal, added };
  }
  /** Moves the clock on by minutes and runs what is due. */
  const later = async ({ core, clock }: ReturnType<typeof calendar>, minutes: number) => {
    clock.set(new Date(clock.now().getTime() + minutes * 60_000).toISOString());
    await core.runDue();
  };

  it('tell every Admin by email and app notification when a text to Susan fails', async () => {
    const { core, sender, store, messenger, added } = await ready();
    sender.refuseNext();
    await core.runDue();
    const [text] = store.texts();
    expect(text).toMatchObject({ status: 'failed', reason: 'refused' });
    const { emails, notifications } = alerts(messenger);
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
    expect(emails[0].email).toEqual({
      subject: "Susan's Calendar alert: a Reminder failed",
      body:
        'A Reminder to Susan failed: the text was refused, so it did not go. ' +
        'She may not have been reminded.\n\n' +
        'Appointment: Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm\n' +
        'Text: the Reminder due Thu, Nov 19, 2026 at 6:00 pm\n\n' +
        'You may want to call Susan. The Appointment and its texts are in the app.',
      opens: `/appointments/${added.id}`,
    });
    expect(notifications[0].notification).toEqual({
      title: "Susan's Calendar alert",
      body: 'A Reminder failed: Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm. She may not have been reminded.',
      opens: `/appointments/${added.id}`,
      tag: `alert-${text.id}`,
    });
    expect(store.texts()[0].alert).toEqual({
      state: 'raised',
      tries: 1,
      triedAt: added.reminders[0].dueAt,
      sent: ADMINS.flatMap((id) => [`email:${id}`, `app:${id}`]),
      refused: [],
    });
  });

  it('go to every Admin, the one who made the Appointment included, and never to Susan', async () => {
    const { core, clock, sender, messenger } = calendar();
    // Susan adds an Appointment herself; its Reminder is then refused.
    await core.changeSettings(susan, { susansNumber: SUSANS_NUMBER });
    const added = await core.addAppointment(susan, checkUp);
    clock.set(added.reminders[0].dueAt);
    sender.refuseNext();
    await core.runDue();
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
    expect(JSON.stringify(reached(messenger))).not.toContain(susan.person.id);
  });

  it('raise one Alert for one failed text, however many runs see it', async () => {
    const cal = await ready();
    cal.sender.breakNext(3);
    await cal.core.runDue();
    for (const minutes of [2, 2, 2, 2, 22]) await later(cal, minutes);
    expect(cal.store.texts()).toMatchObject([{ status: 'failed', reason: 'gaveUp' }]);
    expect(reached(cal.messenger)).toEqual(EVERY_ADMIN);
    expect(alerts(cal.messenger).emails[0].email.body).toMatch(
      /^A Reminder to Susan failed: sending did not go through after 3 tries\./,
    );
  });

  it('raise one Alert when two runs overlap', async () => {
    const { core, clock, sender, messenger, store } = await ready();
    const other = createCalendarCore({
      store,
      clock,
      messenger,
      textSender: sender,
      timeZone: EASTERN,
    });
    sender.refuseNext();
    await Promise.all([core.runDue(), other.runDue(), core.runDue()]);
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
  });

  it('tell every Admin when a text is marked not confirmed delivered, and say so, not "failed"', async () => {
    const { core, store, messenger, added } = await ready();
    await core.runDue();
    const [sent] = store.texts();
    expect(sent.status).toBe('sent');
    expect(alerts(messenger).emails).toEqual([]);

    const marked = await core.recordDelivery({ textId: sent.id, outcome: 'unconfirmed' });
    expect(marked).toMatchObject({ status: 'failed', reason: 'unconfirmed' });
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'unconfirmed' }]);
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
    const { emails, notifications } = alerts(messenger);
    expect(emails[0].email.subject).toBe(
      "Susan's Calendar alert: a Reminder was not confirmed delivered",
    );
    expect(emails[0].email.body).toMatch(
      /^A Reminder to Susan was not confirmed delivered: her phone company has not confirmed that it reached her phone\./,
    );
    expect(`${emails[0].email.subject} ${emails[0].email.body}`).not.toMatch(/failed/i);
    expect(emails[0].email.opens).toBe(`/appointments/${added.id}`);
    expect(notifications[0].notification.body).toMatch(/^A Reminder was not confirmed delivered: /);
    expect(notifications[0].notification.body).not.toMatch(/failed/i);

    // Marked once: hearing of it again changes nothing and raises no second Alert.
    expect(await core.recordDelivery({ textId: sent.id, outcome: 'unconfirmed' })).toBeNull();
    expect(await core.recordDelivery({ textId: sent.id, outcome: 'delivered' })).toBeNull();
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
  });

  it('tell every Admin when a text is reported as not delivered, as a failure', async () => {
    const { core, store, messenger } = await ready();
    await core.runDue();
    const [sent] = store.texts();
    await core.recordDelivery({ textId: sent.id, outcome: 'undelivered' });
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'undelivered' }]);
    const [{ email }] = alerts(messenger).emails;
    expect(email.subject).toBe("Susan's Calendar alert: a Reminder failed");
    expect(email.body).toMatch(/failed: her phone company reported that it could not be delivered/);
  });

  it('raise none for a text confirmed delivered', async () => {
    const { core, store, messenger } = await ready();
    await core.runDue();
    const [sent] = store.texts();
    expect(await core.recordDelivery({ textId: sent.id, outcome: 'delivered' })).toMatchObject({
      status: 'delivered',
      reason: null,
      alert: null,
    });
    expect(alerts(messenger)).toEqual({ emails: [], notifications: [] });
  });

  it('ignore a delivery report for a text that is not in the calendar or was never sent', async () => {
    const { core, sender, store, messenger } = await ready();
    expect(
      await core.recordDelivery({ textId: 'reminder:nothing', outcome: 'unconfirmed' }),
    ).toBeNull();
    sender.breakNext();
    await core.runDue();
    const [waiting] = store.texts();
    expect(await core.recordDelivery({ textId: waiting.id, outcome: 'undelivered' })).toBeNull();
    expect(store.texts()).toMatchObject([{ status: 'waiting' }]);
    expect(alerts(messenger).emails).toEqual([]);
  });

  it('tell every Admin when a Reminder could not be sent in time', async () => {
    const cal = await ready();
    cal.clock.set('2026-11-20T19:00:00.000Z'); // the runs stopped until the Appointment started
    await cal.core.runDue();
    expect(cal.sender.taken()).toEqual([]);
    expect(cal.store.texts()).toMatchObject([{ status: 'notSent', reason: 'tooLate' }]);
    const { emails, notifications } = alerts(cal.messenger);
    expect(emails[0].email.subject).toBe(
      "Susan's Calendar alert: a Reminder could not be sent in time",
    );
    expect(emails[0].email.body).toMatch(
      /^A Reminder to Susan could not be sent in time: the Appointment had started before it could go\. She was not reminded\./,
    );
    expect(notifications[0].notification.body).toMatch(/^A Reminder could not be sent in time: /);
    await later(cal, 5);
    expect(reached(cal.messenger)).toEqual(EVERY_ADMIN);
  });

  it("tell every Admin when a Reminder was not sent only because Susan's number was not set, as a setup problem", async () => {
    const { core, clock, store, messenger } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    clock.set(added.reminders[0].dueAt);
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'notSent', reason: 'noNumber' }]);
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
    const { emails, notifications } = alerts(messenger);
    expect(emails[0].email.subject).toBe(
      "Susan's Calendar alert: a Reminder was not sent, because Susan's mobile number was not set",
    );
    // Said as what happened when it came due: the number may have been set since.
    expect(emails[0].email.body).toMatch(
      /^A Reminder to Susan was not sent: her mobile number was not set in Settings when it came due\. She was not reminded\. Setting her number now does not send this one\./,
    );
    // Not a failure, nor a text that could not be sent in time.
    expect(`${emails[0].email.subject} ${emails[0].email.body}`).not.toMatch(/failed|in time/i);
    expect(notifications[0].notification.body).toMatch(
      /^A Reminder was not sent: Susan's mobile number was not set\./,
    );
  });

  it('say which Appointment and which text, and nothing more personal than that', async () => {
    const { core, sender, messenger } = await ready();
    sender.refuseNext();
    await core.runDue();
    const said = JSON.stringify(alerts(messenger));
    expect(said).toMatch(/Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm/);
    // Not her number, nor the text's words, the Private notes, the Note for Susan, the place, the
    // Driver or who it is with: whoever reads it opens the Appointment for those.
    expect(said).not.toMatch(
      /555|0123|Bring your list|prescription|Heart Clinic|400 Main|Dr\. Patel|Linda|13:15|1:15/,
    );
  });

  it('raise an Alert for a Change notice that fails, naming it as one', async () => {
    const { core, store, messenger, added } = await ready();
    // A Change notice, as ticket 14 sends them, that has just failed.
    const failed: Text = {
      id: `changeNotice:${added.id}:2026-11-19T23:00:00.000Z`,
      kind: 'changeNotice',
      appointmentId: added.id,
      reminderId: null,
      words: "Susan's Calendar: Change: Cardiology check-up is cancelled.",
      dueAt: '2026-11-19T23:00:00.000Z',
      status: 'sent',
      reason: null,
      attempts: 1,
      triedAt: '2026-11-19T23:00:00.000Z',
      sentAt: '2026-11-19T23:00:00.000Z',
      reference: 'stand-in-9',
      creditLeft: null,
      alert: null,
      told: null,
    };
    await store.claimText(failed);
    await core.recordDelivery({ textId: failed.id, outcome: 'undelivered' });
    const [{ email }] = alerts(messenger).emails;
    expect(email.subject).toBe("Susan's Calendar alert: a Change notice failed");
    expect(email.body).toMatch(/Text: the Change notice due Thu, Nov 19, 2026 at 6:00 pm/);
    expect(email.body).toMatch(/She may not know the Appointment changed\./);
  });

  it('raise one for a test text that fails, by the next run, naming it and opening Settings', async () => {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    cal.sender.refuseNext();
    const text = await cal.core.sendTestText(linda);
    expect(text).toMatchObject({ status: 'failed', reason: 'refused', alert: { state: 'due' } });
    // The command only marks it: the scheduled run, the one function that may send email, sends
    // it within the minute.
    expect(alerts(cal.messenger)).toEqual({ emails: [], notifications: [] });
    await later(cal, 1);
    expect(reached(cal.messenger)).toEqual(EVERY_ADMIN);
    const [{ email }] = alerts(cal.messenger).emails;
    expect(email).toEqual({
      subject: "Susan's Calendar alert: a test text failed",
      body:
        'A test text to Susan failed: the text was refused, so it did not go. ' +
        'Texts may not be reaching her phone.\n\n' +
        'It was sent from Settings, to check that texts reach her phone. Its status is in Settings.\n' +
        'Text: the test text asked for Thu, Nov 19, 2026 at 3:00 pm\n\n' +
        'You may want to call Susan.',
      opens: '/settings',
    });
    expect(alerts(cal.messenger).notifications[0].notification).toMatchObject({
      body: 'A test text failed. Texts may not be reaching her phone.',
      opens: '/settings',
    });
  });

  it('raise one for a test text later reported not delivered', async () => {
    const { core, messenger } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const text = await core.sendTestText(linda);
    expect(text.status).toBe('sent');
    await core.recordDelivery({ textId: text.id, outcome: 'undelivered' });
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
    expect(alerts(messenger).emails[0].email.subject).toBe(
      "Susan's Calendar alert: a test text failed",
    );
  });

  it('raise none for a text that failed before the calendar raised Alerts', async () => {
    const { core, clock, store, messenger, added } = await ready();
    const [reminder] = added.reminders;
    await store.claimText({
      id: reminderTextId(added, reminder),
      kind: 'reminder',
      appointmentId: added.id,
      reminderId: reminder.id,
      words: "Susan's Calendar: Cardiology check-up.",
      dueAt: reminder.dueAt,
      status: 'failed',
      reason: 'gaveUp',
      attempts: 3,
      triedAt: reminder.dueAt,
      sentAt: null,
      reference: null,
      creditLeft: null,
      alert: null,
      told: null,
    });
    clock.set('2026-11-19T23:10:00.000Z');
    await core.runDue();
    expect(alerts(messenger)).toEqual({ emails: [], notifications: [] });
  });

  it('try again, a little later, when nobody could be told at all', async () => {
    const cal = await ready();
    cal.sender.refuseNext();
    cal.messenger.fail(true);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await cal.core.runDue();
    // What broke is logged in fixed words, without the Appointment or the text.
    expect(errors.mock.calls.flat().join(' ')).toMatch(/^Alert delivery could not be sent \(\w+\)/);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Cardiology|555/);
    errors.mockRestore();
    expect(cal.store.texts()).toMatchObject([
      { status: 'failed', alert: { state: 'due', tries: 1, sent: [] } },
    ]);
    cal.messenger.fail(false);
    await later(cal, 1); // too soon: it waits as long as a text does
    expect(reached(cal.messenger)).toEqual({ email: [], app: [] });
    await later(cal, 1);
    expect(reached(cal.messenger)).toEqual(EVERY_ADMIN);
    expect(cal.store.texts()).toMatchObject([{ alert: { state: 'raised', tries: 2 } }]);
    await later(cal, 5);
    expect(reached(cal.messenger)).toEqual(EVERY_ADMIN);
  });

  it('send again only what failed: one channel to one Admin, and never what went', async () => {
    const cal = await ready();
    cal.sender.refuseNext();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cal.messenger.failFor('email', 'person-mark');
    await cal.core.runDue();
    expect(reached(cal.messenger)).toEqual({
      email: ['person-linda', 'person-ann'],
      app: ADMINS,
    });
    expect(cal.store.texts()).toMatchObject([{ alert: { state: 'due', tries: 1 } }]);
    await later(cal, 2);
    vi.restoreAllMocks();
    expect(reached(cal.messenger)).toEqual({
      email: ['person-linda', 'person-ann', 'person-mark'],
      app: ADMINS,
    });
    expect(cal.store.texts()).toMatchObject([{ alert: { state: 'raised', tries: 2 } }]);
  });

  it('still go by app notification when email cannot be sent at all', async () => {
    const cal = await ready();
    cal.sender.refuseNext();
    cal.messenger.failEmail(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await cal.core.runDue();
    expect(reached(cal.messenger)).toEqual({ email: [], app: ADMINS });
    cal.messenger.failEmail(false);
    await later(cal, 2);
    vi.restoreAllMocks();
    expect(reached(cal.messenger)).toEqual(EVERY_ADMIN);
  });

  it('give up a delivery that keeps failing after a few tries, and only that one', async () => {
    const cal = await ready();
    cal.sender.refuseNext();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    cal.messenger.failFor('app', 'person-ann', 99);
    await cal.core.runDue();
    for (let n = 0; n < 6; n += 1) await later(cal, 2);
    expect(reached(cal.messenger)).toEqual({ email: ADMINS, app: ['person-linda', 'person-mark'] });
    expect(cal.store.texts()).toMatchObject([
      { alert: { state: 'raised', tries: ALERT_ATTEMPTS } },
    ]);
    expect(errors.mock.calls.flat().join(' ')).toMatch(
      /Alert gave up on deliveries that kept failing/,
    );
    vi.restoreAllMocks();
  });

  it('do not try again one refused for good, nor one with nothing to reach', async () => {
    const cal = await ready();
    cal.sender.refuseNext();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Mark's address will not be sent to; Ann has turned app notifications on for no device.
    cal.messenger.refuseFor('email', 'person-mark');
    cal.messenger.unreachable('app', 'person-ann');
    await cal.core.runDue();
    vi.restoreAllMocks();
    expect(reached(cal.messenger)).toEqual({
      email: ['person-linda', 'person-ann'],
      app: ['person-linda', 'person-mark'],
    });
    expect(cal.store.texts()).toMatchObject([{ alert: { state: 'raised', tries: 1 } }]);
  });

  it('never send again one refused for good, while retrying one that failed, on the same Alert', async () => {
    const cal = await ready();
    cal.sender.refuseNext();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Mark's address will not be sent to, for good; Ann's email fails this once.
    cal.messenger.refuseFor('email', 'person-mark');
    cal.messenger.failFor('email', 'person-ann');
    // Count every email asked for, refused ones included.
    const asked: string[] = [];
    const sendEmail = cal.messenger.sendEmail.bind(cal.messenger);
    cal.messenger.sendEmail = async (to, email, skip = []) => {
      for (const id of to) if (!skip.includes(`email:${id}`)) asked.push(id);
      return sendEmail(to, email, skip);
    };
    await cal.core.runDue();
    expect(cal.store.texts()[0].alert).toMatchObject({
      state: 'due',
      tries: 1,
      refused: ['email:person-mark'],
    });
    await later(cal, 2);
    vi.restoreAllMocks();
    expect(asked).toEqual(['person-linda', 'person-mark', 'person-ann', 'person-ann']);
    expect(reached(cal.messenger)).toEqual({
      email: ['person-linda', 'person-ann'],
      app: ADMINS,
    });
    expect(cal.store.texts()[0].alert).toMatchObject({
      state: 'raised',
      tries: 2,
      refused: ['email:person-mark'],
    });
  });

  it('are not taken up past the last try by a run that stopped on it', async () => {
    const cal = await ready();
    cal.sender.refuseNext();
    cal.messenger.fail(true); // nobody can be told: the Alert is left due after each try
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await cal.core.runDue();
    cal.messenger.fail(false);
    const [text] = cal.store.texts();
    // A run took it up for the last time, sent to Linda by email, and stopped.
    const stopped: Text = {
      ...text,
      alert: {
        state: 'sending',
        tries: ALERT_ATTEMPTS,
        triedAt: cal.clock.now().toISOString(),
        sent: ['email:person-linda'],
        refused: [],
      },
    };
    expect(await cal.store.changeText(stopped, text)).toBe(true);
    errors.mockClear();
    await later(cal, 1); // still held: it may be going
    await later(cal, 1);
    await later(cal, 5);
    expect(reached(cal.messenger)).toEqual({ email: [], app: [] });
    expect(cal.store.texts()[0].alert).toEqual({ ...stopped.alert, state: 'raised' });
    // Said once, in fixed words: how many went and were refused, never to whom.
    const said = errors.mock.calls.flat().join('\n');
    expect(said).toBe(
      `Alert gave up after ${ALERT_ATTEMPTS} tries, the last stopped part way (sent 1, refused 0)`,
    );
    vi.restoreAllMocks();
  });

  it("leave out a phone number typed into the Appointment's name, in both channels", async () => {
    const { core, sender, messenger, added } = await ready({
      what: 'Dentist, call (555) 555-0142 first',
    });
    sender.refuseNext();
    await core.runDue();
    const { emails, notifications } = alerts(messenger);
    expect(emails).toHaveLength(ADMINS.length);
    expect(notifications).toHaveLength(ADMINS.length);
    for (const said of [
      ...emails.map(({ email }) => `${email.subject} ${email.body}`),
      ...notifications.map(({ notification }) => `${notification.title} ${notification.body}`),
    ]) {
      expect(said).not.toMatch(/555|0142/);
      expect(said).toMatch(/Dentist, call \(number left out\) first, Fri, Nov 20, 2026 at 2:00 pm/);
    }
    expect(emails[0].email.opens).toBe(`/appointments/${added.id}`);
    expect(notifications[0].notification.opens).toBe(`/appointments/${added.id}`);
  });

  it('are finished by a later run, without repeats, when a run stops part way through', async () => {
    const cal = await ready();
    cal.sender.refuseNext();
    // A run that stops while sending to Mark by app notification: what it sent before is kept.
    const stopping = createCalendarCore({
      store: cal.store,
      clock: cal.clock,
      messenger: {
        ...cal.messenger,
        admins: () => cal.messenger.admins(),
        sendEmail: (...args) => cal.messenger.sendEmail(...args),
        sendAppNotification: (to, ...rest) =>
          to.includes('person-mark')
            ? new Promise<never>(() => {})
            : cal.messenger.sendAppNotification(to, ...rest),
      },
      textSender: cal.sender,
      timeZone: EASTERN,
    });
    void stopping.runDue();
    await vi.waitFor(() =>
      expect(cal.store.texts()[0].alert?.sent).toEqual([
        'email:person-linda',
        'app:person-linda',
        'email:person-mark',
      ]),
    );
    expect(cal.store.texts()[0].alert?.state).toBe('sending');
    // A run a minute on leaves it: the first may still be going.
    await later(cal, 1);
    expect(reached(cal.messenger).app).toEqual(['person-linda']);
    // Once it has been held longer than any run lasts, a later run takes it up and sends the rest.
    await later(cal, 1);
    expect(reached(cal.messenger)).toEqual(EVERY_ADMIN);
    expect(cal.store.texts()[0].alert).toMatchObject({ state: 'raised', tries: 2 });
  });

  it('do not undo or stop the run when they cannot be sent', async () => {
    const { core, clock, sender, store, messenger } = await ready();
    await core.addAppointment(linda, {
      what: 'Blood draw',
      date: '2026-11-20',
      time: '13:00',
      reminders: [{ shape: 'at', date: '2026-11-19', time: '18:00' }],
    });
    sender.refuseNext();
    messenger.fail(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    vi.restoreAllMocks();
    expect(
      store
        .texts()
        .map((text) => text.status)
        .sort(),
    ).toEqual(['failed', 'sent']);
  });
});

describe('the trouble with texts to Susan', () => {
  /** A text's record, settled at a moment, as the core keeps it. */
  const text = (triedAt: string, settled: Partial<Text>): Text => ({
    id: `reminder:a:${triedAt}`,
    kind: 'reminder',
    appointmentId: 'a',
    reminderId: 'r',
    words: "Susan's Calendar: Cardiology check-up.",
    dueAt: triedAt,
    status: 'sent',
    reason: null,
    attempts: 1,
    triedAt,
    sentAt: triedAt,
    reference: null,
    creditLeft: null,
    alert: null,
    told: null,
    ...settled,
  });

  it('is none while nothing has been sent, or the most recent text went', () => {
    expect(textTrouble([])).toBeNull();
    expect(textTrouble([text('2026-11-19T23:00:00.000Z', {})])).toBeNull();
    expect(
      textTrouble([
        text('2026-11-19T22:00:00.000Z', { status: 'failed', reason: 'refused' }),
        text('2026-11-19T23:00:00.000Z', { status: 'delivered' }),
      ]),
    ).toBeNull();
  });

  it('is the most recent text, while it failed, whatever kind it is', () => {
    const failed = text('2026-11-19T23:00:00.000Z', {
      kind: 'test',
      appointmentId: null,
      status: 'failed',
      reason: 'refused',
    });
    expect(
      textTrouble([failed, text('2026-11-19T22:00:00.000Z', { status: 'delivered' })]),
    ).toEqual({ trouble: 'failed', text: failed });
  });

  it('tells "not confirmed delivered", "not sent in time" and "no number" apart from "failed"', () => {
    const at = '2026-11-19T23:00:00.000Z';
    expect(textTrouble([text(at, { status: 'failed', reason: 'unconfirmed' })])?.trouble).toBe(
      'unconfirmed',
    );
    expect(textTrouble([text(at, { status: 'notSent', reason: 'tooLate' })])?.trouble).toBe(
      'tooLate',
    );
    expect(textTrouble([text(at, { status: 'notSent', reason: 'noNumber' })])?.trouble).toBe(
      'noNumber',
    );
  });

  it('looks past a text still being sent, to the last one settled', () => {
    expect(
      textTrouble([
        text('2026-11-19T22:00:00.000Z', { status: 'failed', reason: 'gaveUp' }),
        text('2026-11-19T23:00:00.000Z', { status: 'waiting', sentAt: null }),
      ])?.trouble,
    ).toBe('failed');
  });

  it('clears once a later text goes', () => {
    const failed = text('2026-11-19T22:00:00.000Z', { status: 'failed', reason: 'refused' });
    expect(textTrouble([failed])?.trouble).toBe('failed');
    expect(textTrouble([failed, text('2026-11-19T22:05:00.000Z', {})])).toBeNull();
  });
});

describe('delivery status', () => {
  /**
   * A calendar whose text sender, like Textbelt, names each text it takes and can be asked later
   * what became of it, with Susan's number set and a Reminder due at 6:00 pm the day before.
   */
  async function tracked(options: { unconfirmedAfter?: number } = {}) {
    const store = createMemoryStore();
    const clock = createFixedClock('2026-11-19T20:00:00.000Z');
    const sender = createStandInSender({ reportsDelivery: true });
    const core = createCalendarCore({
      store,
      clock,
      messenger: createMemoryMessenger(ADMINS),
      textSender: sender,
      timeZone: EASTERN,
      ...options,
    });
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await core.addAppointment(linda, everyDetail);
    /** Runs what is due at a time on Thursday evening, Susan's time ('18:00' is 23:00Z). */
    const runAt = async (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      clock.set(new Date(Date.UTC(2026, 10, 19, hours + 5, minutes)).toISOString());
      return core.runDue();
    };
    await runAt('18:00');
    const [text] = store.texts();
    return { store, clock, sender, core, added, runAt, text };
  }

  it('asks what became of a sent text on each run, and leaves it sent until it is settled', async () => {
    const { store, sender, runAt, text } = await tracked();
    expect(text).toMatchObject({ status: 'sent', reference: 'stand-in-1' });
    for (const report of ['pending', 'pending'] as const) {
      sender.report('stand-in-1', report);
      await runAt('18:05');
    }
    expect(sender.asked()).toEqual(['stand-in-1', 'stand-in-1']);
    expect(store.texts()).toMatchObject([{ status: 'sent', reason: null }]);
  });

  it('marks a text delivered once the sender says so, and stops asking', async () => {
    const { store, sender, runAt } = await tracked();
    sender.report('stand-in-1', 'delivered');
    const done = await runAt('18:03');
    expect(done).toMatchObject([{ status: 'delivered', reason: null }]);
    expect(store.texts()).toMatchObject([{ status: 'delivered', reason: null }]);
    await runAt('18:04');
    await runAt('19:00');
    expect(sender.asked()).toEqual(['stand-in-1']);
    expect(store.texts()).toMatchObject([{ status: 'delivered' }]);
  });

  it('marks a text failed when the sender reports it was not delivered, and stops asking', async () => {
    const { store, sender, runAt } = await tracked();
    sender.report('stand-in-1', 'failed');
    await runAt('18:02');
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'undelivered' }]);
    await runAt('18:03');
    expect(sender.asked()).toEqual(['stand-in-1']);
  });

  it('marks a text not confirmed delivered after 30 minutes with no confirmation', async () => {
    const { store, runAt } = await tracked();
    await runAt('18:29');
    expect(store.texts()).toMatchObject([{ status: 'sent' }]);
    await runAt('18:30');
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'unconfirmed' }]);
  });

  it('tells "not confirmed delivered" apart from a reported failure', async () => {
    const reported = await tracked();
    reported.sender.report('stand-in-1', 'failed');
    await reported.runAt('18:31');
    const unconfirmed = await tracked();
    await unconfirmed.runAt('18:31');
    expect(reported.store.texts()[0].reason).toBe('undelivered');
    expect(unconfirmed.store.texts()[0].reason).toBe('unconfirmed');
  });

  it('still takes a confirmation that comes in the run that would have given up on it', async () => {
    const { store, sender, runAt } = await tracked();
    sender.report('stand-in-1', 'delivered');
    await runAt('18:45');
    expect(store.texts()).toMatchObject([{ status: 'delivered' }]);
  });

  it('stops asking once a text is marked not confirmed delivered', async () => {
    const { sender, runAt } = await tracked();
    await runAt('18:30');
    await runAt('18:31');
    await runAt('19:30');
    expect(sender.asked()).toHaveLength(1);
  });

  it('waits as long as it is told to before a text counts as not confirmed', async () => {
    const { store, runAt } = await tracked({ unconfirmedAfter: 60 * 60_000 });
    await runAt('18:59');
    expect(store.texts()).toMatchObject([{ status: 'sent' }]);
    await runAt('19:00');
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'unconfirmed' }]);
  });

  it('leaves a text sent when the sender cannot be asked, and asks again next run', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, sender, runAt } = await tracked();
    sender.breakReports();
    await runAt('18:05');
    expect(store.texts()).toMatchObject([{ status: 'sent' }]);
    expect(logged.mock.calls.flat().join(' ')).toBe('Delivery status could not be read (unknown)');
    sender.report('stand-in-1', 'delivered');
    await runAt('18:06');
    expect(store.texts()).toMatchObject([{ status: 'delivered' }]);
    logged.mockRestore();
  });

  it('still marks a text not confirmed when the sender cannot be asked by then', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, sender, runAt } = await tracked();
    sender.breakReports(5);
    await runAt('18:30');
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'unconfirmed' }]);
    vi.restoreAllMocks();
  });

  it('asks about the other texts while one answer is slow, and records each as it comes', async () => {
    const store = createMemoryStore();
    const clock = createFixedClock('2026-11-19T20:00:00.000Z');
    const sender = createStandInSender({ reportsDelivery: true });
    const core = createCalendarCore({
      store,
      clock,
      messenger: createMemoryMessenger(ADMINS),
      textSender: sender,
      timeZone: EASTERN,
    });
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    for (const what of ['Eye exam', 'Blood draw', 'Hair', 'Flu shot'])
      await core.addAppointment(linda, { ...checkUp, what });
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    // The oldest text's answer is slow; the others are delivered.
    sender.holdReports('stand-in-1');
    for (const reference of ['stand-in-2', 'stand-in-3', 'stand-in-4'])
      sender.report(reference, 'delivered');
    clock.set('2026-11-19T23:01:00.000Z');
    let finished = false;
    const run = core.runDue().then((done) => {
      finished = true;
      return done;
    });
    await vi.waitFor(() =>
      expect(store.texts().filter((text) => text.status === 'delivered')).toHaveLength(3),
    );
    expect(finished).toBe(false);
    expect(store.texts().find((text) => text.reference === 'stand-in-1')?.status).toBe('sent');
    sender.report('stand-in-1', 'delivered');
    sender.releaseReports();
    expect(await run).toHaveLength(4);
    expect(store.texts().every((text) => text.status === 'delivered')).toBe(true);
  });

  it(`asks about no more than ${STATUS_READS_AT_ONCE} texts at once, the oldest first`, async () => {
    const store = createMemoryStore();
    const clock = createFixedClock('2026-11-19T20:00:00.000Z');
    const sender = createStandInSender({ reportsDelivery: true });
    const core = createCalendarCore({
      store,
      clock,
      messenger: createMemoryMessenger(ADMINS),
      textSender: sender,
      timeZone: EASTERN,
    });
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    for (let n = 0; n < 6; n += 1) {
      clock.set(`2026-11-19T22:0${n}:00.000Z`);
      await core.sendTestText(mark);
    }
    sender.holdReports();
    clock.set('2026-11-19T22:10:00.000Z');
    const run = core.runDue();
    await vi.waitFor(() => expect(sender.asked()).toHaveLength(STATUS_READS_AT_ONCE));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sender.asked()).toEqual(['stand-in-1', 'stand-in-2', 'stand-in-3', 'stand-in-4']);
    sender.releaseReports();
    await run;
    expect(sender.asked()).toHaveLength(6);
  });

  it('sends every due text, one at a time, before asking about any', async () => {
    const { core, clock, sender, store } = await tracked();
    let sending = 0;
    let most = 0;
    const watched = createCalendarCore({
      store,
      clock,
      messenger: createMemoryMessenger(ADMINS),
      timeZone: EASTERN,
      textSender: {
        async send(text) {
          sending += 1;
          most = Math.max(most, sending);
          expect(sender.asked()).toEqual([]);
          await new Promise((resolve) => setTimeout(resolve, 5));
          sending -= 1;
          return sender.send(text);
        },
        delivery: sender.delivery,
      },
    });
    for (const what of ['Eye exam', 'Blood draw', 'Hair'])
      await core.addAppointment(linda, { what, date: '2026-11-20', time: '09:00' });
    clock.set('2026-11-20T13:00:00.000Z'); // 8:00 am: the three new ones' Reminders are overdue
    await watched.runDue();
    expect(sender.taken()).toHaveLength(4);
    expect(most).toBe(1);
    expect(sender.asked()).toContain('stand-in-1');
  });

  it('asks about a test text too, so Settings shows it delivered', async () => {
    const { core, store, sender, runAt } = await tracked();
    const test = await core.sendTestText(mark);
    sender.report(test.reference!, 'delivered');
    await runAt('18:01');
    expect(store.texts().find((text) => text.kind === 'test')).toMatchObject({
      status: 'delivered',
    });
  });

  it('never asks about a text the sender gave no name to: it stays sent', async () => {
    // The stand-in that only records texts names none of them: nothing can confirm them.
    const { core, clock, store } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    await core.addAppointment(linda, checkUp);
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    clock.set('2026-11-20T01:00:00.000Z');
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'sent', reference: null, reason: null }]);
  });

  it('counts a delivered or unconfirmed text as one that reached Susan', async () => {
    const delivered = await tracked();
    delivered.sender.report('stand-in-1', 'delivered');
    await delivered.runAt('18:01');
    await refused(delivered.core.deleteAppointment(mark, delivered.added.id), 'texted');
    const unconfirmed = await tracked();
    await unconfirmed.runAt('18:30');
    await refused(unconfirmed.core.deleteAppointment(mark, unconfirmed.added.id), 'texted');
  });
});

describe('the credit left for texts', () => {
  it('is recorded on each text from what the sender says, so a low balance can be told', async () => {
    const { core, clock, sender, store } = calendar();
    sender.haveCredit(41);
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    await core.addAppointment(linda, checkUp);
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    await core.sendTestText(mark);
    expect(store.texts().map((text) => [text.kind, text.creditLeft])).toEqual([
      ['reminder', 40],
      ['test', 39],
    ]);
  });

  it('is recorded from a refused send too, as when the credit has run out', async () => {
    const { core, sender } = calendar();
    sender.haveCredit(0);
    sender.refuseNext();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    expect(await core.sendTestText(mark)).toMatchObject({
      status: 'failed',
      reason: 'refused',
      creditLeft: 0,
    });
  });

  it('is null when the sender does not say', async () => {
    const { core } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    expect((await core.sendTestText(mark)).creditLeft).toBeNull();
  });
});

describe('web addresses', () => {
  const ADDRESSES = [
    'https://portal.example.com/visit',
    'http://example.org',
    'ftp://files.example.net',
    'www.example.com',
    'WWW.EXAMPLE.COM',
    'example.com/checkin',
    'example.xyz',
    'example.de',
    'portal.example.co.uk',
    'clinic.example.health',
    'EXAMPLE.COM',
    'example.online/booking',
    'example.xn--p1ai',
    'front-desk@example.com',
    'nurse@clinic.example.fr',
  ];

  it('are found however they are written, with any recognized ending', () => {
    for (const address of ADDRESSES) {
      expect(holdsWebAddress(`See ${address} first.`), address).toBe(true);
      expect(holdsWebAddress(address), address).toBe(true);
    }
  });

  it('are not ordinary punctuation, abbreviations, times or doses', () => {
    for (const words of [
      "Susan's Calendar: Cardiology check-up with Dr. Patel, tomorrow at 2:00 pm.",
      'Smith & Co. Dental, 12 St. James St. Suite 4',
      'Bring your list of medicines.Then wait.',
      'Pickup at 1:15 p.m., e.g. by the door, i.e. the front.',
      'Arrive at 10.am and take 2.5mg with food.',
      'Ask for Mr.Li or Dr.Ng at the desk.',
      'U.S. Route 1, Apt.4B, No. 5',
      TEST_TEXT_WORDS,
    ])
      expect(holdsWebAddress(words), words).toBe(false);
  });

  it('are kept as they were written: saving an Appointment or a contact is never refused', async () => {
    const { core, store } = calendar();
    const carried = [
      'what',
      'withWhom',
      'placeName',
      'placeAddress',
      'driverName',
      'noteForSusan',
      'privateNotes',
    ] as const;
    for (const detail of carried) {
      const added = await core.addAppointment(linda, {
        ...checkUp,
        [detail]: 'See www.example.com',
      });
      expect(added[detail]).toBe('See www.example.com');
    }
    expect(store.appointments()).toHaveLength(carried.length);
    const changed = await core.changeSettings(linda, { contactName: 'Linda, www.example.com' });
    expect(changed.contactName).toBe('Linda, www.example.com');
  });

  it('keep a Reminder from being sent, and it says why, while the Appointment is kept', async () => {
    const { core, clock, sender, store } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await core.addAppointment(linda, {
      ...checkUp,
      noteForSusan: 'Check in at www.example.com.',
    });
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    expect(store.texts()).toMatchObject([{ status: 'notSent', reason: 'webAddress', attempts: 0 }]);
    // Never tried, so it did not reach her: the Appointment can be deleted, and a corrected note
    // goes out with the next Reminder.
    expect(store.appointments()[0].noteForSusan).toBe('Check in at www.example.com.');
    await core.deleteAppointment(mark, added.id);
  });

  it('are never sent in a text of any kind: each passes the same check before it goes', async () => {
    const { core, clock, sender, store } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    // One text of each kind, with a web address in its words, waiting to be sent, as the run that
    // claimed it left it. Change notices (ticket 14) and the automatic answer (ticket 17) make
    // their own words; this checks only that none holding an address is sent, whoever wrote it.
    const added = await core.addAppointment(linda, {
      ...checkUp,
      noteForSusan: 'Check in at example.de',
    });
    const [reminder] = added.reminders;
    const fixtures: Record<TextKind, { id: string; reminderId: string | null; words: string }> = {
      reminder: {
        id: `reminder:${added.id}:${reminder.id}:${reminder.dueAt}`,
        reminderId: reminder.id,
        words: "Susan's Calendar: Cardiology check-up. Check in at example.de",
      },
      changeNotice: {
        id: `changeNotice:${added.id}`,
        reminderId: null,
        words: "Susan's Calendar: Change: see https://example.com/new-time",
      },
      automaticAnswer: {
        id: `automaticAnswer:${added.id}`,
        reminderId: null,
        words: "Susan's Calendar: Nobody reads replies here. Email front-desk@example.xyz",
      },
      test: {
        id: 'test:2026-11-19T22:58:00.000Z',
        reminderId: null,
        words: "Susan's Calendar: This is a test text. www.example.com",
      },
    };
    for (const kind of TEXT_KINDS) {
      const { id, reminderId, words } = fixtures[kind];
      await store.claimText({
        id,
        kind,
        appointmentId: kind === 'test' ? null : added.id,
        reminderId,
        words,
        dueAt: reminder.dueAt,
        status: 'waiting',
        reason: null,
        attempts: 1,
        triedAt: '2026-11-19T22:58:00.000Z',
        sentAt: null,
        reference: null,
        creditLeft: null,
        alert: null,
        // A Change notice tells of the Appointment as it is, as the core's would.
        told: kind === 'test' ? null : { date: added.date, time: added.time, cancelled: false },
      });
    }
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    expect(store.texts().map((text) => [text.kind, text.status, text.reason])).toEqual(
      expect.arrayContaining(TEXT_KINDS.map((kind) => [kind, 'failed', 'webAddress'])),
    );
    expect(store.texts()).toHaveLength(TEXT_KINDS.length);
  });

  it('are in none of the texts the calendar writes today', async () => {
    const { core, clock, sender, store } = calendar();
    await core.changeSettings(linda, {
      susansNumber: SUSANS_NUMBER,
      contactName: 'Linda',
      contactPhone: '(555) 555-0187',
    });
    await core.addAppointment(linda, {
      ...everyDetail,
      reminders: [
        { shape: 'before', amount: 2, unit: 'hours' },
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'at', date: '2026-11-20', time: '09:00' },
      ],
    });
    await core.sendTestText(mark);
    for (const at of [
      '2026-11-19T23:00:00.000Z',
      '2026-11-20T14:00:00.000Z',
      '2026-11-20T17:00:00.000Z',
    ]) {
      clock.set(at);
      await core.runDue();
    }
    expect(sender.taken()).toHaveLength(4);
    // A move and then a cancellation, each told in a Change notice once settled.
    await core.changeAppointment(mark, (await store.everyAppointment())[0].id, { time: '15:00' });
    clock.set('2026-11-20T17:05:00.000Z');
    await core.runDue();
    await core.cancelAppointment(mark, (await store.everyAppointment())[0].id);
    clock.set('2026-11-20T17:10:00.000Z');
    await core.runDue();
    const notices = sender.taken().filter(({ words }) => words.includes('Change:'));
    expect(notices).toHaveLength(2);
    for (const { words } of sender.taken()) expect(holdsWebAddress(words)).toBe(false);
  });
});

describe('Alerts from what the text sender says', () => {
  /** Every Alert delivery so far, by channel, as the person IDs it reached in order. */
  const reached = (messenger: MemoryMessenger) => ({
    email: messenger.emails().flatMap(({ to }) => to),
    app: messenger
      .appNotifications()
      .filter(({ notification }) => notification.tag.startsWith('alert-'))
      .flatMap(({ to }) => to),
  });
  const EVERY_ADMIN = { email: ADMINS, app: ADMINS };

  /**
   * A calendar whose sender names each text and is asked what became of it, with Susan's number
   * set and `count` Appointments tomorrow, each with its Reminder sent at 6:00 pm the day before.
   */
  async function sent(count = 1, messenger = createMemoryMessenger(ADMINS)) {
    const store = createMemoryStore();
    const clock = createFixedClock('2026-11-19T20:00:00.000Z');
    const sender = createStandInSender({ reportsDelivery: true });
    const core = createCalendarCore({
      store,
      clock,
      messenger,
      textSender: sender,
      timeZone: EASTERN,
    });
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    for (let n = 0; n < count; n += 1)
      await core.addAppointment(linda, { ...checkUp, time: `1${n}:00` });
    clock.set('2026-11-19T23:00:00.000Z');
    await core.runDue();
    const at = (minutes: number) =>
      clock.set(new Date(Date.parse('2026-11-19T23:00:00.000Z') + minutes * 60_000).toISOString());
    return { store, clock, sender, core, messenger, at };
  }

  it('raise one Alert, once, for a text the sender reports not delivered', async () => {
    const { store, sender, core, messenger, at } = await sent();
    sender.report('stand-in-1', 'failed');
    at(5);
    await core.runDue();
    expect(store.texts()).toMatchObject([
      { status: 'failed', reason: 'undelivered', alert: { state: 'raised' } },
    ]);
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
    expect(messenger.emails()[0].email.subject).toBe("Susan's Calendar alert: a Reminder failed");
    // Settled: it is not asked about again, and raises nothing more.
    at(10);
    await core.runDue();
    expect(sender.asked()).toEqual(['stand-in-1']);
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
  });

  it('raise one Alert, saying so, for a text never confirmed delivered in the time allowed', async () => {
    const { store, sender, core, messenger, at } = await sent();
    sender.report('stand-in-1', 'pending');
    at(29);
    await core.runDue();
    expect(reached(messenger)).toEqual({ email: [], app: [] });
    at(30);
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'unconfirmed' }]);
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
    expect(messenger.emails()[0].email.subject).toBe(
      "Susan's Calendar alert: a Reminder was not confirmed delivered",
    );
    at(40);
    await core.runDue();
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
  });

  it('raise none for a text the sender reports delivered', async () => {
    const { store, sender, core, messenger, at } = await sent();
    sender.report('stand-in-1', 'delivered');
    at(5);
    await core.runDue();
    expect(store.texts()).toMatchObject([{ status: 'delivered', alert: null }]);
    expect(reached(messenger)).toEqual({ email: [], app: [] });
  });

  it('settle a text once when two runs hear the same report, and raise one Alert', async () => {
    const { store, sender, core, messenger, clock, at } = await sent();
    const other = createCalendarCore({
      store,
      clock,
      messenger,
      textSender: sender,
      timeZone: EASTERN,
    });
    sender.report('stand-in-1', 'failed');
    at(5);
    await Promise.all([core.runDue(), other.runDue()]);
    expect(store.texts()).toMatchObject([{ status: 'failed', reason: 'undelivered' }]);
    expect(reached(messenger)).toEqual(EVERY_ADMIN);
  });

  it('are sent only once every answer is in, one delivery at a time, not by each answer', async () => {
    // A messenger that counts how many sends are under way at once.
    const inner = createMemoryMessenger(ADMINS);
    let underWay = 0;
    let most = 0;
    const counted =
      <T>(send: () => Promise<T>) =>
      async () => {
        underWay += 1;
        most = Math.max(most, underWay);
        await new Promise((resolve) => setTimeout(resolve, 1));
        try {
          return await send();
        } finally {
          underWay -= 1;
        }
      };
    const messenger: MemoryMessenger = {
      ...inner,
      sendEmail: (...args) => counted(() => inner.sendEmail(...args))(),
      sendAppNotification: (...args) => counted(() => inner.sendAppNotification(...args))(),
    };
    const { sender, core, at } = await sent(3, messenger);
    for (const reference of ['stand-in-1', 'stand-in-2', 'stand-in-3'])
      sender.report(reference, 'failed');
    // One answer is slow: the Alerts wait for it, and do not go out as each answer comes.
    sender.holdReports('stand-in-3');
    at(5);
    const run = core.runDue();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reached(inner)).toEqual({ email: [], app: [] });
    sender.releaseReports();
    await run;
    expect(reached(inner).email).toHaveLength(3 * ADMINS.length);
    expect(reached(inner).app).toHaveLength(3 * ADMINS.length);
    expect(most).toBe(1);
  });
});

describe('Alerts for a text holding a web address', () => {
  /** The Alerts among the app notifications sent: not the Activity updates. */
  const alertNotifications = (messenger: MemoryMessenger) =>
    messenger
      .appNotifications()
      .filter(({ notification }) => notification.tag.startsWith('alert-'));

  it('say it was not sent because of a web address, apart from failures, without the address', async () => {
    const { core, clock, store, messenger, sender } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await core.addAppointment(linda, {
      ...checkUp,
      noteForSusan: 'Directions at www.example.com/clinic',
    });
    clock.set(added.reminders[0].dueAt);
    await core.runDue();
    expect(sender.taken()).toEqual([]);
    const [text] = store.texts();
    expect(text).toMatchObject({ status: 'notSent', reason: 'webAddress' });
    expect(messenger.emails().flatMap(({ to }) => to)).toEqual(ADMINS);
    const [{ email }] = messenger.emails();
    expect(email.subject).toBe(
      "Susan's Calendar alert: a Reminder was not sent, because it held a web address",
    );
    expect(email.body).toMatch(
      /^A Reminder to Susan was not sent: its words held a web address, which no text to her may carry\. She was not reminded\./,
    );
    const said = JSON.stringify([messenger.emails(), alertNotifications(messenger)]);
    expect(said).not.toMatch(/failed|in time|example\.com/i);
    expect(textTrouble(store.texts())?.trouble).toBe('webAddress');
  });

  it('name an Appointment whose name holds a web address only by its time', async () => {
    const { core, sender, store, messenger, clock } = calendar();
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await core.addAppointment(linda, { ...checkUp, what: 'Visit example.com' });
    clock.set(added.reminders[0].dueAt);
    sender.refuseNext();
    await core.runDue();
    expect(store.texts()[0].reason).toBe('webAddress');
    const said = JSON.stringify([messenger.emails(), alertNotifications(messenger)]);
    expect(said).toMatch(/an Appointment, Fri, Nov 20, 2026 at 2:00 pm/);
    expect(said).not.toMatch(/example\.com/);
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
      reference: null,
      creditLeft: null,
      alert: null,
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
        creditLeft: null,
        alert: null,
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

  it('does not count a Reminder the sender reported undelivered as one she was told', async () => {
    const cal = calendar();
    const sender = createStandInSender({ reportsDelivery: true });
    const core = createCalendarCore({
      store: cal.store,
      clock: cal.clock,
      messenger: createMemoryMessenger(),
      textSender: sender,
      timeZone: EASTERN,
    });
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await core.addAppointment(linda, everyDetail);
    await runAt({ ...cal, core }, '2026-11-19T23:00:00.000Z');
    sender.report('stand-in-1', 'failed');
    await runAt({ ...cal, core }, '2026-11-19T23:01:00.000Z');
    expect(cal.store.texts()).toMatchObject([{ status: 'failed', reason: 'undelivered' }]);
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await core.changeAppointment(mark, added.id, { time: '15:00' });
    await runAt({ ...cal, core }, '2026-11-19T23:15:00.000Z');
    expect(sender.taken()).toHaveLength(1);
    expect(cal.store.texts().map((text) => text.kind)).toEqual(['reminder']);
  });

  it('counts a Reminder sent but not confirmed delivered as one she was told', async () => {
    const cal = calendar();
    const sender = createStandInSender({ reportsDelivery: true });
    const core = createCalendarCore({
      store: cal.store,
      clock: cal.clock,
      messenger: createMemoryMessenger(),
      textSender: sender,
      timeZone: EASTERN,
    });
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await core.addAppointment(linda, everyDetail);
    await runAt({ ...cal, core }, '2026-11-19T23:00:00.000Z');
    await runAt({ ...cal, core }, '2026-11-19T23:30:00.000Z');
    expect(cal.store.texts()).toMatchObject([{ status: 'failed', reason: 'unconfirmed' }]);
    cal.clock.set('2026-11-19T23:40:00.000Z');
    await core.cancelAppointment(mark, added.id);
    await runAt({ ...cal, core }, '2026-11-19T23:45:00.000Z');
    expect(sender.taken().at(-1)?.words).toBe(
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel, tomorrow at 2:00 pm, is cancelled.",
    );
  });

  it('is not sent when its words would hold a web address, like any text', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, {
      time: '15:00',
      withWhom: 'drpatel.com',
    });
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    expect(notices(cal)).toEqual([]);
    expect(cal.store.texts().at(-1)).toMatchObject({
      kind: 'changeNotice',
      status: 'notSent',
      reason: 'webAddress',
    });
  });

  /** Every Alert delivery so far: who each email and each app notification went to, by subject. */
  const alertsSent = ({ messenger }: ReturnType<typeof calendar>) => ({
    emails: messenger.emails().flatMap(({ to, email }) => to.map((id) => `${id} ${email.subject}`)),
    notifications: messenger
      .appNotifications()
      .filter(({ notification }) => notification.tag.startsWith('alert-'))
      .flatMap(({ to, notification }) => to.map((id) => `${id} ${notification.tag}`)),
  });

  it('raises one Alert, to every Admin by each channel, when the core sends one that fails', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { time: '15:00' });
    cal.sender.refuseNext();
    await runAt(cal, '2026-11-19T23:15:00.000Z');
    const notice = cal.store.texts().find((text) => text.kind === 'changeNotice')!;
    expect(notice).toMatchObject({
      status: 'failed',
      reason: 'refused',
      alert: { state: 'raised' },
    });
    for (const at of ['23:16', '23:20', '23:40']) await runAt(cal, `2026-11-19T${at}:00.000Z`);
    expect(alertsSent(cal)).toEqual({
      emails: ADMINS.map((id) => `${id} Susan's Calendar alert: a Change notice failed`),
      notifications: ADMINS.map((id) => `${id} alert-${notice.id}`),
    });
    const [{ email }] = cal.messenger.emails();
    expect(email.body).toMatch(/She may not know the Appointment changed\./);
    expect(email.opens).toBe(`/appointments/${cal.added.id}`);
  });

  it('raises one Alert for a notice recorded as not sent, in words that fit a Change notice', async () => {
    const cal = await reminded();
    cal.clock.set('2026-11-19T23:10:00.000Z');
    await cal.core.changeAppointment(mark, cal.added.id, { time: '13:00' });
    await runAt(cal, '2026-11-20T19:30:00.000Z');
    await runAt(cal, '2026-11-20T19:40:00.000Z');
    const notice = cal.store.texts().find((text) => text.kind === 'changeNotice')!;
    expect(notice).toMatchObject({ status: 'notSent', reason: 'tooLate' });
    expect(alertsSent(cal).emails).toEqual(
      ADMINS.map((id) => `${id} Susan's Calendar alert: a Change notice could not be sent in time`),
    );
    expect(cal.messenger.emails()[0].email.body).toMatch(
      /old and new times had both passed before it could go\. She was not told of the change\./,
    );
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
      creditLeft: null,
      alert: null,
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

  /**
   * Thursday's Appointment at a time that evening, reminded two hours before, then moved at 10:00
   * pm to Friday at 10:00 am, after 7:00 am: only its old time could hurry the notice.
   */
  const movedFromThisEvening = (time: string) =>
    lateEdit(
      {
        date: '2026-11-19',
        time,
        pickupTime: null,
        reminders: [{ shape: 'before', amount: 2, unit: 'hours' }],
      },
      ({ core }, id) => core.changeAppointment(mark, id, { date: '2026-11-20', time: '10:00' }),
    );

  it('waits when the old time had already passed at the edit, though it is before 7:00 am', async () => {
    const cal = await movedFromThisEvening('21:30');
    await runAt(cal, '2026-11-20T03:05:00.000Z');
    expect(sentAt(cal)).toBeUndefined();
    await runAt(cal, '2026-11-20T12:00:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T12:00:00.000Z');
  });

  it('waits when the old time is the very moment of the edit: it is not ahead of it', async () => {
    const cal = await movedFromThisEvening('22:00');
    await runAt(cal, '2026-11-20T03:05:00.000Z');
    expect(sentAt(cal)).toBeUndefined();
    await runAt(cal, '2026-11-20T12:00:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T12:00:00.000Z');
  });

  it('goes at once when the old time is a minute after the edit and before 7:00 am', async () => {
    const cal = await movedFromThisEvening('22:01');
    await runAt(cal, '2026-11-20T03:05:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T03:05:00.000Z');
  });

  it('waits when the new time had already passed at the edit and the old one is after 7:00 am', async () => {
    const cal = await lateEdit({}, ({ core }, id) =>
      core.changeAppointment(mark, id, { date: '2026-11-19', time: '21:30', pickupTime: null }),
    );
    await runAt(cal, '2026-11-20T03:05:00.000Z');
    expect(sentAt(cal)).toBeUndefined();
    await runAt(cal, '2026-11-20T12:00:00.000Z');
    expect(sentAt(cal)).toBe('2026-11-20T12:00:00.000Z');
    expect(cal.sender.taken().at(-1)?.words).toBe(
      "Susan's Calendar: Change: Cardiology check-up with Dr. Patel has moved from today at 2:00 pm to Thursday, November 19 at 9:30 pm.",
    );
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
