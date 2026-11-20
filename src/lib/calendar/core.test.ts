import { describe, expect, it } from 'vitest';
import {
  CalendarRefusal,
  createCalendarCore,
  createFixedClock,
  createMemoryStore,
  overlappingAppointments,
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
