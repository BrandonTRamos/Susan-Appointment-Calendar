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
  type NewAppointment,
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
  blockedSince,
  lowCreditSpell,
  newestFirst,
  repliesNotSeen,
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
        replyId: null,
        creditLeft: null,
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
      replyId: null,
      creditLeft: null,
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
      numberRevision: 1,
      lastChanged: {
        personId: 'person-mark',
        personName: 'Mark',
        viaAgent: false,
        at: '2026-11-19T20:00:00.000Z',
      },
    });
    expect(await store.settings()).toEqual(changed);
  });

  it("move the number's revision on with each change of her number, and with nothing else", async () => {
    const { core } = calendar();
    const revision = async (changes: Parameters<typeof core.changeSettings>[1]) =>
      (await core.changeSettings(linda, changes)).numberRevision;
    expect(await revision({ susansNumber: SUSANS_NUMBER })).toBe(1);
    expect(await revision({ contactName: 'Linda', contactPhone: '5555550187' })).toBe(1);
    expect(await revision({ susansNumber: '(555) 555-0123' })).toBe(1);
    expect(await revision({ susansNumber: '5555550142' })).toBe(2);
    expect(await revision({ susansNumber: null })).toBe(3);
    expect(await revision({ susansNumber: SUSANS_NUMBER })).toBe(4);
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
      replyId: null,
      creditLeft: null,
      alert: null,
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
      replyId: null,
      creditLeft: null,
      alert: null,
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
    replyId: null,
    creditLeft: null,
    alert: null,
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
    // An automatic answer answers a Reply, which it is tried again only while it answers.
    const reply = (await core.receiveReply({ key: null, words: 'Hello', from: SUSANS_NUMBER }))!;
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
        id: 'automaticAnswer:1',
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
        appointmentId: kind === 'test' || kind === 'automaticAnswer' ? null : added.id,
        reminderId,
        replyId: kind === 'automaticAnswer' ? reply.id : null,
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
    const { core, clock, sender } = calendar();
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

describe('Replies', () => {
  /** An invented number for the contact in Settings. */
  const CONTACT = '+15555550187';

  /** A calendar with Susan's number and the contact set, and the check-up added. */
  async function withReplies(
    settings: { contactName?: string | null; contactPhone?: string | null } = {},
  ) {
    const cal = calendar();
    await cal.core.changeSettings(linda, {
      susansNumber: SUSANS_NUMBER,
      contactName: 'Linda',
      contactPhone: CONTACT,
      ...settings,
    });
    const added = await cal.core.addAppointment(mark, everyDetail);
    return { ...cal, added };
  }
  /** Moves the clock on by minutes. */
  const after = ({ clock }: ReturnType<typeof calendar>, minutes: number) =>
    clock.set(new Date(clock.now().getTime() + minutes * 60_000).toISOString());
  /** A Reply from Susan's number, as the text sender's inbound side hands it over. */
  const fromSusan = (words: string, key: string | null = null) => ({
    key,
    words,
    from: SUSANS_NUMBER,
  });
  const ANSWER =
    "Susan's Calendar: Texts to this number are not answered. If you need anything, please call Linda at (555) 555-0187.";
  /** Each Reply passed on so far, by channel, as [person ID, words]. */
  const passedOn = (messenger: MemoryMessenger) => ({
    email: messenger
      .emails()
      .filter(({ email }) => email.opens === '/replies' && !email.subject.includes('alert'))
      .flatMap(({ to, email }) => to.map((id) => [id, email.body])),
    app: messenger
      .appNotifications()
      .filter(({ notification }) => notification.tag.startsWith('reply-'))
      .flatMap(({ to, notification }) => to.map((id) => [id, notification.body])),
  });

  it('are kept with their words and when they came, and change nothing in the calendar', async () => {
    const { core, store, sender, clock } = await withReplies();
    const before = store.appointments();
    const activity = store.activity();
    clock.set('2026-11-19T20:02:00.000Z');
    const reply = (await core.receiveReply(fromSusan("I can't go, I'm not well", 'abc123')))!;
    expect(store.replies()).toEqual([reply]);
    expect(reply).toMatchObject({
      id: 'reply:abc123',
      words: "I can't go, I'm not well",
      receivedAt: '2026-11-19T20:02:00.000Z',
      numberRevision: 1,
      answer: 'due',
      answerTextId: null,
    });
    expect(store.appointments()).toEqual(before);
    expect(store.activity()).toEqual(activity);
    // Nothing is sent and nobody is told until the scheduled run.
    expect(sender.taken()).toEqual([]);
  });

  it('are passed on to every Admin by email and app notification, quoting what she wrote', async () => {
    const cal = await withReplies();
    const { core, messenger, clock } = cal;
    clock.set('2026-11-19T20:02:00.000Z');
    await core.receiveReply(fromSusan("I can't go, I'm not well"));
    after(cal, 1);
    await core.runDue();
    const { email, app } = passedOn(messenger);
    expect(email.map(([id]) => id)).toEqual(ADMINS);
    expect(app.map(([id]) => id)).toEqual(ADMINS);
    expect(JSON.stringify([email, app])).not.toContain(susan.person.id);
    const [{ email: sent }] = messenger.emails();
    expect(sent).toEqual({
      subject: "Susan's Calendar: Susan texted back",
      body:
        "Susan texted back to the calendar's number, Thu, Nov 19, 2026 at 3:02 pm:\n\n" +
        '"I can\'t go, I\'m not well"\n\n' +
        'The calendar does not act on what she writes: nothing was changed, cancelled or confirmed. ' +
        'She was sent the automatic answer, saying texts to this number are not answered and to call Linda.\n\n' +
        'Her Replies are in the app.',
      opens: '/replies',
    });
    const replyNotifications = messenger
      .appNotifications()
      .filter(({ notification }) => notification.tag.startsWith('reply-'));
    expect(replyNotifications[0].notification).toMatchObject({
      title: 'Susan texted back',
      body: '"I can\'t go, I\'m not well"',
      opens: '/replies',
    });
    // Each is passed on once, however many runs follow.
    after(cal, 5);
    await core.runDue();
    expect(passedOn(messenger).email).toHaveLength(ADMINS.length);
  });

  it('get her the automatic answer, naming the contact person and number from Settings', async () => {
    const cal = await withReplies();
    await cal.core.receiveReply(fromSusan('Who is this?'));
    after(cal, 1);
    await cal.core.runDue();
    expect(cal.sender.taken()).toEqual([{ to: SUSANS_NUMBER, words: ANSWER }]);
    const answer = cal.store.texts().find((text) => text.kind === 'automaticAnswer');
    expect(answer).toMatchObject({ status: 'sent', words: ANSWER, appointmentId: null });
    expect(cal.store.replies()[0].answer).toBe('sent');
  });

  it('send the automatic answer at most once an hour, however many Replies come', async () => {
    const cal = await withReplies();
    const { core, sender, store } = cal;
    await core.receiveReply(fromSusan('Hello?'));
    after(cal, 1);
    await core.receiveReply(fromSusan('Is anyone there'));
    await core.runDue();
    after(cal, 10);
    await core.receiveReply(fromSusan('Hello??'));
    await core.runDue();
    after(cal, 40);
    await core.receiveReply(fromSusan('HELP'));
    await core.runDue();
    expect(sender.taken()).toHaveLength(1);
    expect(store.replies().map((reply) => reply.answer)).toEqual([
      'sent',
      'recent',
      'recent',
      'recent',
    ]);
    // An hour after the last answer, the next Reply gets one again.
    after(cal, 15);
    await core.receiveReply(fromSusan('Thank you'));
    await core.runDue();
    expect(sender.taken()).toHaveLength(2);
    // Each was still passed on.
    expect(passedOn(cal.messenger).email).toHaveLength(5 * ADMINS.length);
  });

  it('tell the Admins when she was not answered again, and why', async () => {
    const cal = await withReplies();
    await cal.core.receiveReply(fromSusan('One'));
    after(cal, 1);
    await cal.core.receiveReply(fromSusan('Two'));
    await cal.core.runDue();
    const bodies = cal.messenger.emails().map(({ email }) => email.body);
    expect(bodies.filter((body) => body.includes('"Two"'))[0]).toContain(
      'She was not sent the automatic answer again: she had it less than an hour before.',
    );
  });

  it('are never read for meaning: no word in one changes, cancels or confirms anything', async () => {
    const cal = await withReplies({});
    const { core, store, sender, added } = cal;
    const before = store.appointments();
    const words = [
      'Cancel',
      'CANCEL MY APPOINTMENT',
      'Yes',
      'C',
      'Move it to 3pm',
      'STOP',
      'START',
      'HELP',
      'Delete',
    ];
    for (const each of words) {
      await core.receiveReply(fromSusan(each));
      after(cal, 61);
      await core.runDue();
    }
    expect(store.appointments()).toEqual(before);
    expect(store.activity()).toHaveLength(1);
    // Every word is passed on and answered the same way, STOP and HELP included.
    expect(store.replies().map((reply) => [reply.words, reply.answer])).toEqual(
      words.map((each) => [each, 'sent']),
    );
    const answers = store.texts().filter((text) => text.kind === 'automaticAnswer');
    expect(answers.map((text) => text.words)).toEqual(words.map(() => ANSWER));
    // Her Reminder still went at its time, as it was set.
    const [reminder] = store.texts().filter((text) => text.kind === 'reminder');
    expect(reminder).toMatchObject({ status: 'sent', dueAt: added.reminders[0].dueAt });
    expect(sender.taken().map((text) => text.words)).toContain(reminder.words);
  });

  it('are kept, passed on and answered once when the same Reply arrives twice', async () => {
    const cal = await withReplies();
    const first = (await cal.core.receiveReply(fromSusan('Running late', 'same')))!;
    const again = (await cal.core.receiveReply(fromSusan('Running late', 'same')))!;
    expect(again).toEqual(first);
    after(cal, 1);
    await cal.core.runDue();
    expect(cal.store.replies()).toHaveLength(1);
    expect(cal.sender.taken()).toHaveLength(1);
    expect(passedOn(cal.messenger).email).toHaveLength(ADMINS.length);
  });

  it("from any number but Susan's, or while hers is not set, are kept, passed on and answered not at all", async () => {
    const cal = await withReplies();
    expect(
      await cal.core.receiveReply({ key: null, words: 'Who is this?', from: '+15555550199' }),
    ).toBeNull();
    expect(await cal.core.receiveReply({ key: null, words: 'Hi', from: null })).toBeNull();
    expect(await cal.core.receiveReply({ key: null, words: 'Hi', from: 'Susan' })).toBeNull();
    await cal.core.changeSettings(linda, { susansNumber: null });
    expect(await cal.core.receiveReply(fromSusan('Hello'))).toBeNull();
    after(cal, 1);
    await cal.core.runDue();
    expect(cal.store.replies()).toEqual([]);
    expect(cal.sender.taken()).toEqual([]);
    expect(passedOn(cal.messenger)).toEqual({ email: [], app: [] });
  });

  it('are taken as from Susan however her number is written', async () => {
    const cal = await withReplies();
    for (const from of ['+1 (555) 555-0123', '5555550123', '15555550123'])
      expect(await cal.core.receiveReply({ key: null, words: 'Hi', from })).not.toBeNull();
  });

  it("are not answered once Susan's number has changed since they came, but are still passed on", async () => {
    const cal = await withReplies();
    await cal.core.receiveReply(fromSusan('Hello'));
    await cal.core.changeSettings(linda, { susansNumber: '+15555550142' });
    after(cal, 1);
    await cal.core.runDue();
    expect(cal.sender.taken()).toEqual([]);
    expect(cal.store.replies()[0]).toMatchObject({ answer: 'numberChanged', answerTextId: null });
    expect(passedOn(cal.messenger).email[0][1]).toContain(
      "She was not sent the automatic answer: Susan's mobile number was changed in Settings after it came.",
    );
    // Changing it back is a change too: the Reply came under the first, not this one.
    await cal.core.receiveReply(fromSusan('Again'));
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    after(cal, 1);
    await cal.core.runDue();
    expect(cal.sender.taken()).toEqual([]);
  });

  it('are still answered when only the contact changed since they came, naming the new one', async () => {
    const cal = await withReplies();
    await cal.core.receiveReply(fromSusan('Hello'));
    await cal.core.changeSettings(linda, { contactName: 'Mark', contactPhone: '5555550166' });
    after(cal, 1);
    await cal.core.runDue();
    expect(cal.sender.taken()).toEqual([
      {
        to: SUSANS_NUMBER,
        words:
          "Susan's Calendar: Texts to this number are not answered. If you need anything, please call Mark at (555) 555-0166.",
      },
    ]);
  });

  it("send an answer that is tried again only while Susan's number is the one its Reply came from", async () => {
    const cal = await withReplies();
    await cal.core.receiveReply(fromSusan('Hello'));
    cal.sender.breakNext();
    await cal.core.runDue();
    const [waiting] = cal.store.texts();
    expect(waiting).toMatchObject({ kind: 'automaticAnswer', status: 'waiting' });
    await cal.core.changeSettings(linda, { susansNumber: '+15555550142' });
    after(cal, 3);
    await cal.core.runDue();
    // Nothing goes to the number that replaced hers; the earlier try may have gone, so it failed.
    expect(cal.sender.taken()).toEqual([]);
    expect(cal.store.texts()[0]).toMatchObject({ status: 'failed', reason: 'numberChanged' });
    const alert = cal.messenger.emails().find(({ email }) => email.subject.includes('alert'));
    expect(alert?.email.subject).toBe("Susan's Calendar alert: an automatic answer failed");
  });

  it('send an answer tried again to the same number when it has not changed', async () => {
    const cal = await withReplies();
    await cal.core.receiveReply(fromSusan('Hello'));
    cal.sender.breakNext();
    await cal.core.runDue();
    await cal.core.changeSettings(linda, { contactName: 'Mark' });
    after(cal, 3);
    await cal.core.runDue();
    expect(cal.sender.taken().map((text) => text.to)).toEqual([SUSANS_NUMBER]);
    expect(cal.store.texts()[0]).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('send one answer for a backlog of Replies taken up together, however far apart they came', async () => {
    const cal = await withReplies();
    // Two Replies two hours apart, and no run between them, as when the scheduled run was down.
    await cal.core.receiveReply(fromSusan('Morning'));
    after(cal, 120);
    await cal.core.receiveReply(fromSusan('Afternoon'));
    after(cal, 1);
    await cal.core.runDue();
    expect(cal.sender.taken()).toHaveLength(1);
    expect(cal.store.replies().map((reply) => reply.answer)).toEqual(['sent', 'recent']);
    // Both are passed on.
    expect(passedOn(cal.messenger).email).toHaveLength(2 * ADMINS.length);
  });

  it('send one answer when two runs overlap, and pass each Reply on once', async () => {
    const cal = await withReplies();
    const other = createCalendarCore({
      store: cal.store,
      clock: cal.clock,
      messenger: cal.messenger,
      textSender: cal.sender,
      timeZone: EASTERN,
    });
    await cal.core.receiveReply(fromSusan('One'));
    after(cal, 90);
    await cal.core.receiveReply(fromSusan('Two'));
    after(cal, 1);
    await Promise.all([cal.core.runDue(), other.runDue()]);
    after(cal, 1);
    await Promise.all([cal.core.runDue(), other.runDue()]);
    expect(cal.sender.taken()).toHaveLength(1);
    expect(cal.store.texts().map((text) => text.id)).toEqual(['automaticAnswer:1']);
    expect(
      cal.store
        .replies()
        .map((reply) => reply.answer)
        .sort(),
    ).toEqual(['recent', 'sent']);
    expect(passedOn(cal.messenger).email).toHaveLength(2 * ADMINS.length);
  });

  it('take up an answer a run claimed and stopped before marking its Reply, without a second', async () => {
    const cal = await withReplies();
    const reply = (await cal.core.receiveReply(fromSusan('Hello')))!;
    await cal.store.claimText({
      id: 'automaticAnswer:1',
      kind: 'automaticAnswer',
      appointmentId: null,
      reminderId: null,
      replyId: reply.id,
      words: ANSWER,
      dueAt: cal.clock.now().toISOString(),
      status: 'sent',
      reason: null,
      attempts: 1,
      triedAt: cal.clock.now().toISOString(),
      sentAt: cal.clock.now().toISOString(),
      reference: null,
      creditLeft: null,
      alert: null,
    });
    after(cal, 1);
    await cal.core.runDue();
    expect(cal.sender.taken()).toEqual([]);
    expect(cal.store.replies()[0]).toMatchObject({
      answer: 'sent',
      answerTextId: 'automaticAnswer:1',
    });
  });

  it('without a contact in Settings, still say texts here are not answered', async () => {
    const cal = await withReplies({ contactName: null, contactPhone: null });
    await cal.core.receiveReply(fromSusan('Hello'));
    after(cal, 1);
    await cal.core.runDue();
    expect(cal.sender.taken()[0].words).toBe(
      "Susan's Calendar: Texts to this number are not answered. If you need anything, please call someone who helps you.",
    );
  });

  it('name only the contact person, or only the number, when only one is set', async () => {
    const named = await withReplies({ contactPhone: null });
    await named.core.receiveReply(fromSusan('Hello'));
    await named.core.runDue();
    expect(named.sender.taken()[0].words).toMatch(/please call Linda\.$/);
    const numbered = await withReplies({ contactName: null });
    await numbered.core.receiveReply(fromSusan('Hello'));
    await numbered.core.runDue();
    expect(numbered.sender.taken()[0].words).toMatch(/please call \(555\) 555-0187\.$/);
  });

  it('get an automatic answer that holds no web address, and none is sent if the contact holds one', async () => {
    const plain = await withReplies();
    await plain.core.receiveReply(fromSusan('Hello'));
    await plain.core.runDue();
    expect(holdsWebAddress(plain.sender.taken()[0].words)).toBe(false);
    const linked = await withReplies({ contactName: 'Linda at linda.example.de' });
    await linked.core.receiveReply(fromSusan('Hello'));
    await linked.core.runDue();
    expect(linked.sender.taken()).toEqual([]);
    const [answer] = linked.store.texts();
    expect(answer).toMatchObject({
      kind: 'automaticAnswer',
      status: 'notSent',
      reason: 'webAddress',
    });
    // The Admins are told, as for any text that was not sent.
    const alert = linked.messenger.emails().find(({ email }) => email.subject.includes('alert'));
    expect(alert?.email.subject).toBe(
      "Susan's Calendar alert: an automatic answer was not sent, because it held a web address",
    );
  });

  it('raise an Alert, opening Replies, when the automatic answer fails', async () => {
    const cal = await withReplies();
    await cal.core.receiveReply(fromSusan('Hello'));
    cal.sender.refuseNext();
    await cal.core.runDue();
    const alert = cal.messenger.emails().find(({ email }) => email.subject.includes('alert'));
    expect(alert?.email).toMatchObject({
      subject: "Susan's Calendar alert: an automatic answer failed",
      opens: '/replies',
    });
    expect(alert?.email.body).toContain(
      'It answered a text Susan sent. Her Replies are in the app.',
    );
  });

  it('are passed on again, a little later, only where a delivery failed', async () => {
    const cal = await withReplies();
    cal.messenger.failFor('email', mark.person.id);
    await cal.core.receiveReply(fromSusan('Hello'));
    await cal.core.runDue();
    expect(passedOn(cal.messenger).email.map(([id]) => id)).toEqual([
      linda.person.id,
      ann.person.id,
    ]);
    after(cal, 3);
    await cal.core.runDue();
    expect(passedOn(cal.messenger).email.map(([id]) => id)).toEqual([
      linda.person.id,
      ann.person.id,
      mark.person.id,
    ]);
    expect(passedOn(cal.messenger).app).toHaveLength(ADMINS.length);
    expect(cal.store.replies()[0].passOn.state).toBe('raised');
  });

  it('keep what she wrote, without characters nobody can see, up to a limit', async () => {
    const cal = await withReplies();
    const reply = (await cal.core.receiveReply(fromSusan('  On my​ way\r\nsee you\u0007 ')))!;
    expect(reply.words).toBe('On my way\nsee you');
    const long = (await cal.core.receiveReply(fromSusan('a'.repeat(5000))))!;
    expect(long.words).toHaveLength(1600);
    const odd = (await cal.core.receiveReply({ key: null, words: 42, from: SUSANS_NUMBER }))!;
    expect(odd.words).toBe('');
  });

  it('cut a long Reply short in the app notification, but not in the email', async () => {
    const cal = await withReplies();
    await cal.core.receiveReply(fromSusan('word '.repeat(100).trim()));
    await cal.core.runDue();
    const [{ notification }] = cal.messenger
      .appNotifications()
      .filter((each) => each.notification.tag.startsWith('reply-'));
    expect(notification.body.length).toBeLessThan(260);
    expect(notification.body).toMatch(/\.\.\."$/);
    expect(cal.messenger.emails()[0].email.body).toContain('word '.repeat(99).trim());
  });

  it('are counted as not yet seen until the person has seen them, each person apart', async () => {
    const cal = await withReplies();
    await cal.core.receiveReply(fromSusan('One'));
    after(cal, 1);
    const second = (await cal.core.receiveReply(fromSusan('Two')))!;
    const replies = cal.store.replies();
    expect(repliesNotSeen(replies, await cal.store.repliesSeen(linda.person.id))).toBe(2);
    expect(await cal.core.seeReplies(linda, second.receivedAt)).toBe(second.receivedAt);
    expect(repliesNotSeen(replies, await cal.store.repliesSeen(linda.person.id))).toBe(0);
    expect(repliesNotSeen(replies, await cal.store.repliesSeen(mark.person.id))).toBe(2);
    // Seeing an older one later does not take back what was seen.
    expect(await cal.core.seeReplies(linda, replies[0].receivedAt)).toBe(second.receivedAt);
    after(cal, 1);
    await cal.core.receiveReply(fromSusan('Three'));
    expect(repliesNotSeen(cal.store.replies(), second.receivedAt)).toBe(1);
  });

  it('refuse to be marked seen up to something that is not a moment', async () => {
    const cal = await withReplies();
    await refused(cal.core.seeReplies(linda, 'yesterday'), 'invalid');
  });

  it('are listed newest first', async () => {
    const cal = await withReplies();
    await cal.core.receiveReply(fromSusan('One'));
    after(cal, 1);
    await cal.core.receiveReply(fromSusan('Two'));
    expect(newestFirst(cal.store.replies()).map((reply) => reply.words)).toEqual(['Two', 'One']);
  });
});

describe('blocked texts', () => {
  /** Every Alert delivery so far, by channel, as [person ID, subject or body]. */
  const alertSubjects = (messenger: MemoryMessenger) =>
    messenger
      .emails()
      .filter(({ email }) => email.subject.includes('alert'))
      .map(({ to, email }) => [to, email.subject]);

  async function ready() {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    const added = await cal.core.addAppointment(mark, everyDetail);
    cal.clock.set(added.reminders[0].dueAt);
    return { ...cal, added };
  }

  it('raise an Alert when a send is refused because she opted out, saying only she can undo it by replying START', async () => {
    const { core, sender, store, messenger, added } = await ready();
    sender.blockNext();
    await core.runDue();
    const [text] = store.texts();
    expect(text).toMatchObject({ status: 'failed', reason: 'blocked' });
    const [{ email }] = messenger.emails();
    expect(email).toEqual({
      subject:
        "Susan's Calendar alert: a Reminder was not sent, because texts to Susan are blocked",
      body:
        'A Reminder to Susan was not sent: texts to her phone are blocked, because she opted out, as by replying STOP. ' +
        "She was not reminded. Only she can undo it, by replying START to a text from the calendar's number.\n\n" +
        'Appointment: Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm\n' +
        'Text: the Reminder due Thu, Nov 19, 2026 at 6:00 pm\n\n' +
        'You may want to call Susan. The Appointment and its texts are in the app.',
      opens: `/appointments/${added.id}`,
    });
    const alertNotifications = messenger
      .appNotifications()
      .filter(({ notification }) => notification.tag.startsWith('alert-'));
    expect(alertNotifications[0].notification.body).toBe(
      "A Reminder was not sent: texts to Susan are blocked. Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm. Only she can undo it, by replying START to a text from the calendar's number.",
    );
    expect(
      messenger
        .emails()
        .map(({ to }) => to)
        .flat(),
    ).toEqual(ADMINS);
    // A refused text did not reach her: the Appointment can still be deleted.
    await core.deleteAppointment(linda, added.id);
  });

  it('are blocked from a blocked send until a text sent later is delivered', async () => {
    const cal = calendar();
    const sender = createStandInSender({ reportsDelivery: true });
    const core = createCalendarCore({ ...cal, textSender: sender, timeZone: EASTERN });
    await core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    sender.blockNext();
    const blocked = await core.sendTestText(linda);
    expect(blockedSince(cal.store.texts(), [])).toBe(blocked.triedAt);
    // Still blocked while a later text is only sent, or fails for another reason.
    cal.clock.set('2026-11-19T20:05:00.000Z');
    const sent = await core.sendTestText(linda);
    cal.clock.set('2026-11-19T20:06:00.000Z');
    sender.refuseNext();
    await core.sendTestText(linda);
    expect(blockedSince(cal.store.texts(), [])).toBe(blocked.triedAt);
    // Clears once it is delivered.
    sender.report(sent.reference!, 'delivered');
    await core.runDue();
    expect(blockedSince(cal.store.texts(), [])).toBeNull();
  });

  it('are blocked from an opt-out report, which raises one Alert, by the next run, to every Admin', async () => {
    const { core, store, messenger, clock } = await ready();
    clock.set('2026-11-19T20:30:00.000Z');
    const alert = await core.recordOptOut({ key: 'report-1' });
    expect(alert).toMatchObject({ kind: 'textsBlocked', raisedAt: '2026-11-19T20:30:00.000Z' });
    expect(await core.recordOptOut({ key: 'report-1' })).toBeNull();
    expect(blockedSince(store.texts(), store.calendarAlerts())).toBe('2026-11-19T20:30:00.000Z');
    // Nobody is told until the scheduled run, which alone sends email.
    expect(messenger.emails()).toEqual([]);
    clock.set('2026-11-19T20:31:00.000Z');
    await core.runDue();
    expect(alertSubjects(messenger)).toEqual(
      ADMINS.map((id) => [[id], "Susan's Calendar alert: texts to Susan are blocked"]),
    );
    const [{ email }] = messenger.emails();
    expect(email.body).toContain(
      "Only she can undo it, by replying START to a text from the calendar's number.",
    );
    expect(email.opens).toBe('/settings');
    expect(
      messenger
        .appNotifications()
        .filter(({ notification }) => notification.tag.startsWith('alert-'))
        .flatMap(({ to }) => to),
    ).toEqual(ADMINS);
    // Once, however many runs follow.
    clock.set('2026-11-19T20:40:00.000Z');
    await core.runDue();
    expect(alertSubjects(messenger)).toHaveLength(ADMINS.length);
    expect(store.calendarAlerts()[0].progress.state).toBe('raised');
  });

  it('show as trouble with the most recent text, apart from failures', async () => {
    const { core, sender, store } = await ready();
    sender.blockNext();
    await core.runDue();
    expect(textTrouble(store.texts())?.trouble).toBe('blocked');
  });
});

describe('the credit left for texts running low', () => {
  async function ready() {
    const cal = calendar();
    await cal.core.changeSettings(linda, { susansNumber: SUSANS_NUMBER });
    return cal;
  }
  /** Sends a test text a minute on, then runs what is due, as the next scheduled run would. */
  async function sendOne({ core, clock }: ReturnType<typeof calendar>) {
    clock.set(new Date(clock.now().getTime() + 60_000).toISOString());
    await core.sendTestText(linda);
    await core.runDue();
  }
  const lowCreditAlerts = (messenger: MemoryMessenger) =>
    messenger.emails().filter(({ email }) => email.subject.includes('text credit'));

  it('raises one Alert when the credit falls below 20, and not again until it is topped up', async () => {
    const cal = await ready();
    cal.sender.haveCredit(21);
    await sendOne(cal); // 20 left
    expect(lowCreditAlerts(cal.messenger)).toEqual([]);
    await sendOne(cal); // 19 left
    expect(lowCreditAlerts(cal.messenger)).toHaveLength(ADMINS.length);
    const [{ email }] = lowCreditAlerts(cal.messenger);
    expect(email).toEqual({
      subject: "Susan's Calendar alert: text credit is running low",
      body:
        'The prepaid credit for texts to Susan is down to 19 texts, below 20. ' +
        'When it runs out, no Reminder or other text reaches her.\n\n' +
        "Buy more credit for the text service (the owner's setup notes say how). " +
        'You will not be told again until the credit has been topped up.',
      opens: '/settings',
    });
    await sendOne(cal); // 18
    await sendOne(cal); // 17
    expect(lowCreditAlerts(cal.messenger)).toHaveLength(ADMINS.length);
    // Topped up, then low again: one more.
    cal.sender.haveCredit(101);
    await sendOne(cal); // 100
    expect(lowCreditAlerts(cal.messenger)).toHaveLength(ADMINS.length);
    cal.sender.haveCredit(12);
    await sendOne(cal); // 11
    expect(lowCreditAlerts(cal.messenger)).toHaveLength(2 * ADMINS.length);
    expect(cal.store.calendarAlerts().map((alert) => alert.creditLeft)).toEqual([19, 11]);
  });

  it('is told from a refused send too, as when the credit has run out', async () => {
    const cal = await ready();
    cal.sender.haveCredit(0);
    cal.sender.refuseNext();
    await sendOne(cal);
    expect(lowCreditAlerts(cal.messenger)).toHaveLength(ADMINS.length);
    expect(lowCreditAlerts(cal.messenger)[0].email.body).toContain('down to 0 texts');
  });

  it('raises none while the text sender says nothing about credit', async () => {
    const cal = await ready();
    await sendOne(cal);
    await sendOne(cal);
    expect(lowCreditAlerts(cal.messenger)).toEqual([]);
    expect(cal.store.calendarAlerts()).toEqual([]);
  });

  it('is not raised twice by credit readings that come back out of order', () => {
    const reading = (id: string, sentAt: string, credit: number): Text => ({
      id,
      kind: 'test',
      appointmentId: null,
      reminderId: null,
      words: TEST_TEXT_WORDS,
      dueAt: sentAt,
      status: 'sent',
      reason: null,
      attempts: 1,
      triedAt: sentAt,
      sentAt,
      reference: null,
      replyId: null,
      creditLeft: credit,
      alert: null,
    });
    const texts = [
      reading('a', '2026-11-19T20:00:00.000Z', 25),
      reading('b', '2026-11-19T20:01:00.000Z', 18),
      reading('c', '2026-11-19T20:02:00.000Z', 19),
      reading('d', '2026-11-19T20:03:00.000Z', 17),
    ];
    expect(lowCreditSpell(texts)?.id).toBe('b');
    expect(lowCreditSpell(texts.slice(0, 1))).toBeNull();
  });
});
