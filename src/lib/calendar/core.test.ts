import { describe, expect, it } from 'vitest';
import {
  CalendarRefusal,
  createCalendarCore,
  createFixedClock,
  createMemoryStore,
  overlappingAppointments,
  pastAppointments,
  remindersStillToSend,
  reminderWords,
  upcomingAppointments,
  type Actor,
  type Appointment,
  type MemoryStore,
  type NewAppointment,
  type NewSeries,
  type ReminderSetting,
} from './index';

const EASTERN = 'America/New_York';
const HOUR = 60 * 60_000;

const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };
const mark: Actor = { person: { id: 'person-mark', name: 'Mark' }, viaAgent: false };
/** The one account that is not an Admin's. The core is never told which account that is. */
const susan: Actor = { person: { id: 'person-susan', name: 'Susan' }, viaAgent: false };
const lindasAgent: Actor = { person: linda.person, viaAgent: true };

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
  return { store, clock, core: createCalendarCore({ store, clock, timeZone }) };
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
const plan = (appointment: Appointment) =>
  appointment.reminders.map(({ id: _id, ...reminder }) => reminder);

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

    it('leaves out a day the clocks skip its start time, and keeps the rest', async () => {
      const { core } = calendar();
      const { appointments } = await core.addSeries(linda, {
        what: 'Night shift check',
        date: '2027-03-07',
        time: '02:30',
        repeat: { every: 'week', weekdays: [6] },
      });
      expect(datesOf(appointments).slice(0, 2)).toEqual(['2027-03-07', '2027-03-21']);
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
      const { core, store, series, appointments } = await changing();
      const [, , third, fourth] = appointments;
      // Susan was told of the Thursday after it: she has to hear it is off.
      store.noteTextSentAbout(fourth.id);
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
