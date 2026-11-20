// The calendar core: every rule about the calendar, and the only thing that writes calendar data.
// The app, and later the MCP server and the scheduled run, all change the calendar by calling the
// commands here, so none of them can get round a rule.
//
// It reaches the outside world only through its ports (ports.ts) and holds no provider-specific
// code: it runs the same in a backend function, in the browser on sample data, and in a test.

import {
  addDays,
  formatDate,
  formatTime,
  isDate,
  isTime,
  localDateTime,
  momentOf,
} from '../localTime';
import { activityUpdate, seriesActivityUpdate } from './activityUpdate';
import {
  DETAIL_NAMES as NAMES,
  DETAILS,
  inDateOrder,
  REMINDER_UNITS,
  type ActivityAction,
  type ActivityRecord,
  type Actor,
  type Appointment,
  type AppointmentChanges,
  type AppointmentDetails,
  type Detail,
  type NewAppointment,
  type Reminder,
  type ReminderTiming,
  type ReminderUnit,
  type Stamp,
} from './appointment';
import { calendarFeed } from './feed';
import type { AdminMessenger, AppNotification, Clock, Store } from './ports';
import { reminderDue, STARTING_REMINDER } from './reminders';
import {
  MOST_MONTHS,
  MOST_WEEKS,
  repeatDates,
  repeatGives,
  SERIES_HORIZON_DAYS,
  weekdayOf,
  WEEKDAY_NAMES,
  type NewSeries,
  type Repeat,
  type Series,
  type SeriesChanges,
  type SeriesReminder,
} from './series';
import {
  isSubscriptionSecret,
  newSubscriptionSecret,
  subscriptionHash,
  type MadeSubscriptionLink,
} from './subscription';

/** Why a command was refused. */
export type RefusalReason =
  /** The details given do not make an Appointment. */
  | 'invalid'
  /** The calendar has no such Appointment. */
  | 'missing'
  /** The Appointment is cancelled. */
  | 'cancelled'
  /** Susan has been texted about the Appointment. */
  | 'texted';

/** What a refusal can point at: one detail, the Reminders, or how a Series repeats or ends. */
export type RefusalField = Detail | 'reminders' | 'repeat' | 'ends';

/**
 * A command the core would not carry out. Nothing was changed. The message is written for the
 * person who asked, and says what to do next; it holds nothing about the Appointment beyond what
 * they sent.
 */
export class CalendarRefusal extends Error {
  constructor(
    readonly reason: RefusalReason,
    message: string,
    /** The detail that was wrong, when it was one, 'reminders' for a Reminder, or a Series' part. */
    readonly detail?: RefusalField,
  ) {
    super(message);
    this.name = 'CalendarRefusal';
  }
}

export interface CalendarCore {
  /**
   * Adds an Appointment. It needs what it is, its date and its start time. It starts with one
   * Reminder, the day before at 6:00 pm, unless it is given its own Reminders, which can be none.
   *
   * Whoever sends the command can give the new Appointment its ID, a UUID. Then the same add
   * arriving twice, as when the answer to the first was lost on the way back, is carried out once.
   */
  addAppointment(by: Actor, details: NewAppointment, id?: string | null): Promise<Appointment>;
  /**
   * Changes the details given; the rest stay as they were. Reminders, when given, are the whole new
   * list. Refused for a cancelled Appointment. Changes that leave the Appointment as it is do
   * nothing: nobody changed it.
   *
   * When the Appointment moves, Reminders set as a gap or as days before follow it; one set at an
   * exact time keeps its time and is flagged for review until someone confirms or changes it.
   */
  changeAppointment(by: Actor, id: string, changes: AppointmentChanges): Promise<Appointment>;
  /** Marks the Appointment cancelled. It stays in the calendar. */
  cancelAppointment(by: Actor, id: string): Promise<Appointment>;
  /**
   * Removes an Appointment entered by mistake. Refused once any text about it has gone to Susan:
   * cancel it instead, so that she is told.
   */
  deleteAppointment(by: Actor, id: string): Promise<void>;

  /**
   * Adds a Series: Appointments that repeat on a pattern, entered once. The date is its first
   * Appointment's, which has to be a day the pattern gives. Each Appointment in it is a real one,
   * made ahead up to a rolling horizon (SERIES_HORIZON_DAYS, series.ts) and topped up after that by
   * topUpSeries. Its Reminders are gap-based only and apply to every Appointment; with none given,
   * each starts with the day before at 6:00 pm. It leaves one activity record, about its first
   * Appointment. Given its ID, a UUID, the same add arriving twice is carried out once.
   */
  addSeries(
    by: Actor,
    details: NewSeries,
    id?: string | null,
  ): Promise<{ series: Series; appointments: Appointment[] }>;
  /**
   * Changes an Appointment in a Series and all later ones: the Series ends the day before this
   * one, and continues from here as a new Series, which is the old one with these changes. Later
   * Appointments are replaced, including ones changed on their own. One on a date the new Series
   * also has is changed in place; any other is removed, or cancelled when Susan has been texted
   * about it, so that she can be told. Answers with this Appointment as it now is, the first of the
   * new Series. Changes that change nothing do nothing. Changing only this one is changeAppointment.
   */
  changeSeries(by: Actor, id: string, changes: SeriesChanges): Promise<Appointment>;
  /**
   * Cancels an Appointment in a Series and all later ones, keeping them in the calendar marked
   * cancelled, and ends the Series the day before it. Cancelling only this one is cancelAppointment.
   */
  endSeries(by: Actor, id: string): Promise<Appointment>;
  /**
   * Makes the Appointments each Series still needs as the horizon moves on: a Series with no end,
   * or with its end beyond the horizon, so that it never runs dry. It is run every day. Nobody
   * acts, so it leaves no activity record; each Appointment it makes was added by whoever added the
   * Series.
   */
  topUpSeries(): Promise<void>;

  /**
   * Makes the person a new calendar subscription link, which switches off any they had. The secret
   * in it is handed back this once: only a hash of it is kept.
   */
  makeSubscriptionLink(by: Actor): Promise<MadeSubscriptionLink>;
  /** Switches off the person's subscription link. Nothing happens when they have none. */
  switchOffSubscriptionLink(by: Actor): Promise<void>;
  /**
   * The calendar as an iCalendar feed (feed.ts), for the link with this secret. Null for a secret
   * that is not a link's, whether it never was one or its link was switched off: which of the two
   * is never told.
   */
  subscriptionFeed(secret: unknown): Promise<string | null>;
}

export interface CalendarCoreOptions {
  store: Store;
  clock: Clock;
  messenger: AdminMessenger;
  /** Susan's time zone, from resolveTimeZone (src/lib/timeZone.ts). */
  timeZone: string;
}

/** The details that are words: how long each may be, and whether it may run over several lines. */
const WORDS: Partial<Record<Detail, { limit: number; lines: boolean }>> = {
  what: { limit: 120, lines: false },
  withWhom: { limit: 120, lines: false },
  placeName: { limit: 120, lines: false },
  placeAddress: { limit: 300, lines: false },
  driverName: { limit: 80, lines: false },
  noteForSusan: { limit: 300, lines: true },
  privateNotes: { limit: 4000, lines: true },
};

const NO_DETAILS: AppointmentDetails = {
  what: '',
  date: '',
  time: '',
  withWhom: null,
  placeName: null,
  placeAddress: null,
  driverName: null,
  pickupTime: null,
  noteForSusan: null,
  privateNotes: null,
};

/** Only the details of an Appointment, without its ID, state and stamps. */
const detailsOf = (appointment: AppointmentDetails) =>
  Object.fromEntries(DETAILS.map((detail) => [detail, appointment[detail]])) as Record<
    Detail,
    string | null
  >;

function invalid(message: string, detail?: RefusalField): never {
  throw new CalendarRefusal('invalid', message, detail);
}

/** Characters nobody can see: controls other than line breaks and tabs, and zero-width marks. */
const UNSEEN = /(?![\n\r\t])[\p{Cc}\u200b-\u200d\u2060\ufeff]/gu;

/** An ID the sender of an add may choose: a UUID, as `crypto.randomUUID()` makes them. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One detail as it was sent, tidied: nothing unseen, no stray spaces, and null when it is empty.
 * Notes keep their line breaks.
 */
function tidied(detail: Detail, sent: unknown): string | null {
  if (sent === null || sent === undefined) return null;
  if (typeof sent !== 'string') invalid(`Write ${NAMES[detail]} in words.`, detail);
  const words = WORDS[detail];
  // A date or a time: checked once the whole Appointment is known.
  if (!words) return sent.trim() || null;
  const seen = sent.replace(UNSEEN, '');
  const tidy = (
    words.lines ? seen.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ') : seen.replace(/\s+/g, ' ')
  ).trim();
  if (tidy.length > words.limit)
    invalid(`Keep ${NAMES[detail]} to ${words.limit} characters or fewer.`, detail);
  return tidy || null;
}

/** The details that were sent, tidied. What was sent comes from outside, so nothing is assumed. */
function given(sent: unknown): Partial<Record<Detail, string | null>> {
  if (typeof sent !== 'object' || sent === null || Array.isArray(sent))
    invalid("The Appointment's details could not be read.");
  const details: Partial<Record<Detail, string | null>> = {};
  for (const detail of DETAILS) {
    const value = (sent as Record<string, unknown>)[detail];
    if (value !== undefined) details[detail] = tidied(detail, value);
  }
  return details;
}

/** Whether an Appointment already has exactly these details. */
const hasDetails = (appointment: Appointment, details: AppointmentDetails) =>
  DETAILS.every((detail) => appointment[detail] === details[detail]);

/** The details of a real Appointment, or a refusal saying what is wrong with them. */
function checked(details: Record<Detail, string | null>): AppointmentDetails {
  const { what, date, time, pickupTime } = details;
  if (!what) invalid('Say what the Appointment is.', 'what');
  if (!date) invalid('Pick the date.', 'date');
  if (!isDate(date)) invalid('That date is not a real date.', 'date');
  if (date < '2000-01-01' || date > '2099-12-31') invalid("Check the date's year.", 'date');
  if (!time) invalid('Pick the start time.', 'time');
  if (!isTime(time)) invalid('That start time is not a time of day.', 'time');
  if (pickupTime && !isTime(pickupTime))
    invalid('That pickup time is not a time of day.', 'pickupTime');
  return { ...details, what, date, time };
}

/** A Reminder's timing as one string, to tell whether two Reminders go out on the same terms. */
function timingKey(timing: ReminderTiming): string {
  switch (timing.shape) {
    case 'before':
      return `before ${timing.amount} ${timing.unit}`;
    case 'daysBefore':
      return `daysBefore ${timing.days} ${timing.time}`;
    case 'at':
      return `at ${timing.date} ${timing.time}`;
  }
}

/** Everything about a Reminder as one string. */
const reminderKey = (reminder: Reminder) =>
  `${reminder.id} ${timingKey(reminder)} ${reminder.dueAt} ${reminder.needsReview}`;

const sameReminders = (a: readonly Reminder[], b: readonly Reminder[]) =>
  a.length === b.length && a.every((reminder, n) => reminderKey(reminder) === reminderKey(b[n]));

const whole = (n: unknown, least: number, most: number): n is number =>
  Number.isInteger(n) && (n as number) >= least && (n as number) <= most;

/** A Reminder's timing as it was sent, or a refusal saying what is wrong with it. */
function timingOf(sent: unknown, wrong: (message: string) => never): ReminderTiming {
  if (typeof sent !== 'object' || sent === null || Array.isArray(sent))
    wrong('It could not be read.');
  const { shape, amount, unit, days, date, time } = sent as Record<string, unknown>;
  switch (shape) {
    case 'before':
      if (!whole(amount, 1, 999) || !REMINDER_UNITS.includes(unit as never))
        wrong('Say how long before the start, in whole minutes, hours or days.');
      return { shape, amount, unit: unit as ReminderUnit };
    case 'daysBefore':
      if (!whole(days, 0, 365)) wrong('Say how many days before, from 0 to 365.');
      if (typeof time !== 'string' || !isTime(time)) wrong('Pick the time it goes out.');
      return { shape, days, time };
    case 'at':
      if (typeof date !== 'string' || !isDate(date)) wrong('Pick the date it goes out.');
      if (typeof time !== 'string' || !isTime(time)) wrong('Pick the time it goes out.');
      return { shape, date, time };
    default:
      return wrong('It could not be read.');
  }
}

/** The details a Series gives each of its Appointments, besides the date. */
type SeriesDetails = Omit<AppointmentDetails, 'date'>;

const seriesDetailsOf = (details: AppointmentDetails | Series): SeriesDetails =>
  Object.fromEntries(
    DETAILS.filter((detail) => detail !== 'date').map((detail) => [
      detail,
      (details as unknown as Record<Detail, string | null>)[detail],
    ]),
  ) as SeriesDetails;

const sameDetails = (a: SeriesDetails, b: SeriesDetails) =>
  DETAILS.every((detail) => detail === 'date' || a[detail] === b[detail]);

const sameRepeat = (a: Repeat, b: Repeat) => JSON.stringify(a) === JSON.stringify(b);

const sameTimings = (a: readonly ReminderTiming[], b: readonly ReminderTiming[]) =>
  a.map(timingKey).join('; ') === b.map(timingKey).join('; ');

const dayOfMonth = (date: string) => Number(date.slice(8, 10));

/** A pattern as it was sent, for a Series whose first Appointment is on `starts`, or a refusal. */
function repeatOf(sent: unknown, starts: string): Repeat {
  const wrong = (message: string): never => invalid(message, 'repeat');
  if (typeof sent !== 'object' || sent === null || Array.isArray(sent))
    wrong('Say how it repeats: every week or every month.');
  const { every, interval, weekdays } = sent as Record<string, unknown>;
  const gap = interval ?? 1;
  if (every === 'week') {
    if (!whole(gap, 1, MOST_WEEKS)) wrong(`Say how many weeks apart, from 1 to ${MOST_WEEKS}.`);
    if (!Array.isArray(weekdays) || weekdays.length === 0)
      wrong('Pick at least one day of the week it repeats on.');
    if (!(weekdays as unknown[]).every((weekday) => whole(weekday, 0, 6)))
      wrong('Pick the days of the week it repeats on.');
    const days = [...new Set(weekdays as number[])].sort((a, b) => a - b);
    return onItsFirstDay({ every, interval: gap as number, weekdays: days }, starts);
  }
  if (every === 'month') {
    if (!whole(gap, 1, MOST_MONTHS)) wrong(`Say how many months apart, from 1 to ${MOST_MONTHS}.`);
    return { every, interval: gap as number, day: dayOfMonth(starts) };
  }
  return wrong('Say how it repeats: every week or every month.');
}

/** The pattern, or a refusal when it does not give the date its first Appointment is on. */
function onItsFirstDay(repeat: Repeat, starts: string): Repeat {
  if (!repeatGives(repeat, starts))
    invalid(
      `The first Appointment is on a ${WEEKDAY_NAMES[weekdayOf(starts)]}, which is not a day it repeats on. Pick that day too, or another date.`,
      'repeat',
    );
  return repeat;
}

/** When a Series that starts on `starts` ends, as it was sent: a date, or null for no end. */
function endsOf(sent: unknown, starts: string): string | null {
  if (sent === null || sent === undefined || sent === '') return null;
  if (typeof sent !== 'string' || !isDate(sent))
    invalid('That end date is not a real date.', 'ends');
  if (sent < starts)
    invalid(`It would end before its first Appointment, on ${formatDate(starts)}.`, 'ends');
  if (sent > '2099-12-31') invalid("Check the end date's year.", 'ends');
  return sent;
}

/** A Series' Reminders as they were sent, or a refusal naming the one that is wrong. */
function seriesRemindersOf(sent: unknown): SeriesReminder[] {
  if (!Array.isArray(sent)) invalid("The Series' Reminders could not be read.", 'reminders');
  return sent.map((each: unknown, n) => {
    const wrong = (message: string): never => invalid(`Reminder ${n + 1}: ${message}`, 'reminders');
    const timing = timingOf(each, wrong);
    if (timing.shape === 'at')
      return wrong(
        'A Reminder on a Series goes out a set time before each Appointment, not at an exact time. Set an exact time on one Appointment instead.',
      );
    return timing;
  });
}

/** Writes in batches, so that a Series of many Appointments is written in a few seconds. */
async function inBatches<T>(items: readonly T[], write: (item: T) => Promise<void>) {
  for (let n = 0; n < items.length; n += 10) await Promise.all(items.slice(n, n + 10).map(write));
}

export function createCalendarCore({
  store,
  clock,
  messenger,
  timeZone,
}: CalendarCoreOptions): CalendarCore {
  /** The moment an Appointment starts, in Susan's time zone. */
  function startOf({ date, time }: AppointmentDetails): string {
    const moment = momentOf(date, time, timeZone);
    if (!moment)
      invalid(
        `There is no ${formatTime(time)} on ${formatDate(date)}: the clocks go forward that night. Pick another start time.`,
        'time',
      );
    return moment.toISOString();
  }

  /**
   * The Reminders an Appointment will have, from those sent, or a refusal naming the one that is
   * wrong. `before` are the ones it had, and `moved` whether its date or time is changing.
   */
  function settled(
    sent: unknown,
    details: AppointmentDetails,
    startsAt: string,
    before: readonly Reminder[],
    moved: boolean,
  ): Reminder[] {
    if (!Array.isArray(sent))
      invalid("The Appointment's Reminders could not be read.", 'reminders');
    const taken = new Set<string>();
    const reminders = sent.map((each: unknown, n): Reminder => {
      const wrong = (message: string): never =>
        invalid(`Reminder ${n + 1}: ${message}`, 'reminders');
      const timing = timingOf(each, wrong);
      const { id, reviewed } = each as { id?: unknown; reviewed?: unknown };
      const was = before.find((reminder) => reminder.id === id && !taken.has(reminder.id));
      const same = was !== undefined && timingKey(was) === timingKey(timing);
      // An exact time stays put when the Appointment moves, so a person has to look at it again.
      const needsReview =
        timing.shape === 'at' && same && (moved || (was.needsReview && reviewed !== true));
      const due = reminderDue(timing, details, timeZone);
      if (!due && timing.shape === 'at')
        wrong(
          `There is no ${formatTime(timing.time)} on ${formatDate(timing.date)}: the clocks go forward that night. Pick another time.`,
        );
      if (!due) return wrong('It could not be worked out.');
      if (!needsReview && due.toISOString() >= startsAt)
        wrong('It would go out after the Appointment starts. Pick an earlier time.');
      const reminderId = was?.id ?? crypto.randomUUID();
      taken.add(reminderId);
      return { id: reminderId, ...timing, dueAt: due.toISOString(), needsReview };
    });
    return reminders.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }

  const stamp = (by: Actor, at: string): Stamp => ({
    personId: by.person.id,
    personName: by.person.name,
    viaAgent: by.viaAgent,
    at,
  });

  /**
   * The one activity record a command leaves when it changes the calendar. One on a whole Series
   * names it.
   */
  function record(
    action: ActivityAction,
    appointment: Appointment,
    by: Actor,
    at: string,
    seriesId: string | null = null,
  ) {
    const activity: ActivityRecord = {
      id: crypto.randomUUID(),
      ...stamp(by, at),
      action,
      appointmentId: appointment.id,
      seriesId,
      what: appointment.what,
      date: appointment.date,
      time: appointment.time,
    };
    return store.recordActivity(activity);
  }

  /**
   * Sends the Activity update for one command to every Admin but the person who gave it, or whose
   * agent did. Susan is not an Admin, so she is never told. The change has been made by now: one
   * that cannot be told of still stands, and what broke is logged without the Appointment.
   */
  async function tellOtherAdmins(by: Actor, update: AppNotification) {
    try {
      const to = [...new Set(await messenger.admins())].filter((id) => id !== by.person.id);
      if (to.length) await messenger.sendAppNotification(to, update);
    } catch (error) {
      const e = error instanceof Error ? error : null;
      console.error(
        'Activity update could not be sent',
        e?.name ?? 'Unknown error',
        e?.message.slice(0, 300) ?? '',
      );
    }
  }

  async function existing(id: unknown): Promise<Appointment> {
    const found = typeof id === 'string' && id ? await store.appointment(id) : null;
    if (!found)
      throw new CalendarRefusal(
        'missing',
        'That Appointment is not in the calendar. It may have been deleted.',
      );
    return found;
  }

  /** An Appointment's Series, from the Appointment, or a refusal when it cannot be changed so. */
  async function seriesFrom(appointment: Appointment) {
    const place = appointment.series;
    if (!place)
      invalid('This Appointment is not in a Series, so there are no later ones to change.');
    if (appointment.state === 'cancelled')
      throw new CalendarRefusal(
        'cancelled',
        'This Appointment is cancelled, so it cannot be changed. Pick a later one in the Series.',
      );
    const series = await store.series(place.id);
    if (!series)
      throw new CalendarRefusal(
        'missing',
        'That Series is not in the calendar. Change this Appointment on its own instead.',
      );
    return { place, series };
  }

  /** Susan's date today. */
  const today = () => localDateTime(clock.now(), timeZone).date;

  /**
   * How far ahead a Series' Appointments are made: the horizon after today, or after it starts
   * when that is later, and never past its end.
   */
  function horizonOf({ starts, ends }: Pick<Series, 'starts' | 'ends'>): string {
    const day = today();
    const through = addDays(starts > day ? starts : day, SERIES_HORIZON_DAYS);
    return ends && ends < through ? ends : through;
  }

  /**
   * The Appointment a Series has on a date: a new one, or `was` given the Series' details. Null for
   * a date whose start time the clocks skip, which the Series leaves out. A new one is added by
   * whoever added the Series; one changed in place is stamped as changed by `by`.
   */
  function occurrence(
    series: Series,
    date: string,
    was?: Appointment,
    by?: Actor,
    at?: string,
  ): Appointment | null {
    const details: AppointmentDetails = { ...seriesDetailsOf(series), date };
    const moment = momentOf(date, details.time, timeZone);
    if (!moment) return null;
    const startsAt = moment.toISOString();
    const before = was?.reminders ?? [];
    // A Reminder with the same timing as one the Appointment has keeps its ID.
    const taken = new Set<string>();
    const settings = series.reminders.map((timing) => {
      const same = before.find((r) => !taken.has(r.id) && timingKey(r) === timingKey(timing));
      if (same) taken.add(same.id);
      return same ? { ...timing, id: same.id } : timing;
    });
    const moved = was !== undefined && (was.date !== date || was.time !== details.time);
    const reminders = settled(settings, details, startsAt, before, moved);
    const place = { id: series.id, date, repeat: series.repeat, individuallyChanged: false };
    if (!was)
      return {
        id: `${series.id}-${date}`,
        ...details,
        startsAt,
        state: 'active',
        reminders,
        series: place,
        added: series.added,
        lastChanged: null,
      };
    const changed = !hasDetails(was, details) || !sameReminders(was.reminders, reminders);
    return {
      ...was,
      ...details,
      startsAt,
      reminders,
      series: place,
      lastChanged: changed && by && at ? stamp(by, at) : was.lastChanged,
    };
  }

  /** The Appointments a Series has on these dates, leaving out any the clocks skip. */
  const occurrences = (series: Series, dates: string[]) =>
    dates.flatMap((date) => occurrence(series, date) ?? []);

  /**
   * Adds the Appointments the calendar does not have yet. Each has an ID made from its Series and
   * date, so one that an earlier, interrupted command or run already added is not added twice.
   */
  const addMissing = (appointments: Appointment[]) =>
    inBatches(appointments, async (appointment) => {
      if (!(await store.appointment(appointment.id))) await store.addAppointment(appointment);
    });

  /** A Series' Appointments as the calendar has them, in date order. */
  const appointmentsIn = async (seriesId: string) =>
    inDateOrder(
      (await store.everyAppointment()).filter((appointment) => appointment.series?.id === seriesId),
    );

  return {
    async addAppointment(by, sent, id) {
      const details = checked({ ...NO_DETAILS, ...given(sent) });
      const startsAt = startOf(details);
      const asked = (sent as { reminders?: unknown }).reminders;
      const reminders = settled(asked ?? [STARTING_REMINDER], details, startsAt, [], false);
      if (id !== undefined && id !== null) {
        if (typeof id !== 'string' || !ID.test(id))
          invalid("The Appointment's ID could not be read.");
        const already = await store.appointment(id);
        // The same add, arriving again: it has been carried out, so there is nothing left to do.
        const timings = (all: Reminder[]) => all.map(timingKey).join('; ');
        if (
          already &&
          already.added.personId === by.person.id &&
          hasDetails(already, details) &&
          timings(already.reminders) === timings(reminders)
        )
          return already;
        if (already)
          invalid('That Appointment has already been saved. Open it from the list to change it.');
      }
      const at = clock.now().toISOString();
      const appointment: Appointment = {
        id: id ?? crypto.randomUUID(),
        ...details,
        startsAt,
        state: 'active',
        reminders,
        series: null,
        added: stamp(by, at),
        lastChanged: null,
      };
      await store.addAppointment(appointment);
      await record('added', appointment, by, at);
      await tellOtherAdmins(by, activityUpdate({ action: 'added', by, appointment }));
      return appointment;
    },

    async changeAppointment(by, id, sent) {
      const current = await existing(id);
      if (current.state === 'cancelled')
        throw new CalendarRefusal(
          'cancelled',
          'This Appointment is cancelled, so it cannot be changed. Add a new one if it is happening after all.',
        );
      const details = checked({ ...detailsOf(current), ...given(sent) });
      const startsAt = startOf(details);
      const moved = details.date !== current.date || details.time !== current.time;
      const asked = (sent as { reminders?: unknown }).reminders;
      const reminders = settled(
        asked ?? current.reminders,
        details,
        startsAt,
        current.reminders,
        moved,
      );
      if (hasDetails(current, details) && sameReminders(current.reminders, reminders))
        return current;
      const at = clock.now().toISOString();
      const appointment: Appointment = {
        ...current,
        ...details,
        startsAt,
        reminders,
        // Changed only this one: the rest of its Series is as it was.
        series: current.series && { ...current.series, individuallyChanged: true },
        lastChanged: stamp(by, at),
      };
      await store.replaceAppointment(appointment);
      await record('changed', appointment, by, at);
      await tellOtherAdmins(
        by,
        activityUpdate({ action: 'changed', by, appointment, before: current }),
      );
      return appointment;
    },

    async cancelAppointment(by, id) {
      const current = await existing(id);
      if (current.state === 'cancelled')
        throw new CalendarRefusal('cancelled', 'This Appointment is already cancelled.');
      const at = clock.now().toISOString();
      const appointment: Appointment = {
        ...current,
        state: 'cancelled',
        series: current.series && { ...current.series, individuallyChanged: true },
        lastChanged: stamp(by, at),
      };
      await store.replaceAppointment(appointment);
      await record('cancelled', appointment, by, at);
      await tellOtherAdmins(by, activityUpdate({ action: 'cancelled', by, appointment }));
      return appointment;
    },

    async deleteAppointment(by, id) {
      const current = await existing(id);
      if (await store.textSentAbout(current.id))
        throw new CalendarRefusal(
          'texted',
          'Susan has already been texted about this Appointment, so it cannot be deleted. Cancel it instead.',
        );
      await store.removeAppointment(current.id);
      // Deleting sends no Activity update: it is for an Appointment entered by mistake, and the
      // spec tells Admins only of adding, changing and cancelling.
      await record('deleted', current, by, clock.now().toISOString());
    },

    async addSeries(by, sent, id) {
      const details = checked({ ...NO_DETAILS, ...given(sent) });
      startOf(details);
      const { repeat, ends, reminders } = sent as Partial<Record<string, unknown>>;
      const starts = details.date;
      const series: Series = {
        id: '',
        ...seriesDetailsOf(details),
        repeat: repeatOf(repeat, starts),
        starts,
        ends: endsOf(ends, starts),
        reminders: seriesRemindersOf(reminders ?? [STARTING_REMINDER]),
        madeThrough: '',
        added: stamp(by, clock.now().toISOString()),
        lastChanged: null,
      };
      if (id !== undefined && id !== null) {
        if (typeof id !== 'string' || !ID.test(id)) invalid("The Series' ID could not be read.");
        const already = await store.series(id);
        // The same add, arriving again: it has been carried out, so there is nothing left to do.
        if (
          already &&
          already.added.personId === by.person.id &&
          already.starts === series.starts &&
          sameDetails(already, series) &&
          sameRepeat(already.repeat, series.repeat) &&
          already.ends === series.ends &&
          sameTimings(already.reminders, series.reminders)
        )
          return { series: already, appointments: await appointmentsIn(id) };
        if (already)
          invalid('That Series has already been saved. Open one of its Appointments to change it.');
      }
      series.id = id ?? crypto.randomUUID();
      series.madeThrough = horizonOf(series);
      const appointments = occurrences(
        series,
        repeatDates(series.repeat, starts, series.ends, series.madeThrough),
      );
      // Written last, so that an add cut off part of the way is carried out in full when sent again.
      await addMissing(appointments);
      await store.addSeries(series);
      await record('added', appointments[0], by, series.added.at, series.id);
      // One Activity update for the whole Series, not one per Appointment in it.
      await tellOtherAdmins(
        by,
        seriesActivityUpdate({ action: 'added', by, series, from: appointments[0] }),
      );
      return { series, appointments };
    },

    async changeSeries(by, id, sent) {
      const picked = await existing(id);
      const { place, series: old } = await seriesFrom(picked);
      // What is not changed stays as the Series has it, which puts back what was changed on its own.
      const details = checked({ ...seriesDetailsOf(old), date: place.date, ...given(sent) });
      startOf(details);
      const starts = details.date;
      const asked = sent as Partial<Record<string, unknown>>;
      let repeat: Repeat;
      if (asked.repeat !== undefined) repeat = repeatOf(asked.repeat, starts);
      else if (old.repeat.every === 'month' && starts !== place.date)
        repeat = { ...old.repeat, day: dayOfMonth(starts) };
      else repeat = onItsFirstDay(old.repeat, starts);
      const ends = 'ends' in asked ? endsOf(asked.ends, starts) : old.ends;
      if (ends && ends < starts)
        invalid(`It would end before its first Appointment, on ${formatDate(starts)}.`, 'ends');
      const reminders =
        asked.reminders !== undefined ? seriesRemindersOf(asked.reminders) : old.reminders;
      if (
        starts === place.date &&
        sameDetails(seriesDetailsOf(details), old) &&
        sameRepeat(repeat, old.repeat) &&
        ends === old.ends &&
        sameTimings(reminders, old.reminders)
      )
        return picked;

      const at = clock.now().toISOString();
      const next: Series = {
        id: crypto.randomUUID(),
        ...seriesDetailsOf(details),
        repeat,
        starts,
        ends,
        reminders,
        madeThrough: '',
        added: stamp(by, at),
        lastChanged: null,
      };
      next.madeThrough = horizonOf(next);
      const dates = repeatDates(repeat, starts, ends, next.madeThrough);
      const later = (await appointmentsIn(old.id)).filter(
        (appointment) => appointment.id !== picked.id && appointment.series!.date >= place.date,
      );

      // This one begins the new Series. A later one on a date it also has is changed in place, so
      // that whatever Susan has been told about it carries on; a cancelled one cannot be.
      const onDate = new Map<string, Appointment>([[starts, picked]]);
      for (const appointment of later) {
        const { date } = appointment.series!;
        if (appointment.state === 'active' && dates.includes(date) && !onDate.has(date))
          onDate.set(date, appointment);
      }
      const reused: Appointment[] = [];
      const made: Appointment[] = [];
      for (const date of dates) {
        const was = onDate.get(date);
        const appointment = occurrence(next, date, was, by, at);
        if (appointment) (was ? reused : made).push(appointment);
      }
      const kept = new Set(reused.map((appointment) => appointment.id));
      const replaced = later.filter((appointment) => !kept.has(appointment.id));
      const changed = reused.find((appointment) => appointment.id === picked.id)!;

      await inBatches(replaced, async (appointment) => {
        if (!(await store.textSentAbout(appointment.id))) {
          await store.removeAppointment(appointment.id);
        } else if (appointment.state === 'active') {
          // Kept and cancelled, so that she can be told it is off.
          await store.replaceAppointment({
            ...appointment,
            state: 'cancelled',
            lastChanged: stamp(by, at),
          });
        }
      });
      await inBatches(reused, (appointment) => store.replaceAppointment(appointment));
      await addMissing(made);
      await store.addSeries(next);
      await store.replaceSeries({
        ...old,
        ends: addDays(place.date, -1),
        lastChanged: stamp(by, at),
      });
      await record('changed', changed, by, at, next.id);
      await tellOtherAdmins(
        by,
        seriesActivityUpdate({ action: 'changed', by, series: next, from: changed }),
      );
      return changed;
    },

    async endSeries(by, id) {
      const picked = await existing(id);
      const { place, series } = await seriesFrom(picked);
      const at = clock.now().toISOString();
      const cancel = (appointment: Appointment): Appointment => ({
        ...appointment,
        state: 'cancelled',
        lastChanged: stamp(by, at),
      });
      const later = (await appointmentsIn(series.id)).filter(
        (appointment) =>
          appointment.id !== picked.id &&
          appointment.series!.date >= place.date &&
          appointment.state === 'active',
      );
      const cancelled = cancel(picked);
      await inBatches([cancelled, ...later.map(cancel)], (appointment) =>
        store.replaceAppointment(appointment),
      );
      await store.replaceSeries({
        ...series,
        ends: addDays(place.date, -1),
        lastChanged: stamp(by, at),
      });
      await record('cancelled', cancelled, by, at, series.id);
      await tellOtherAdmins(
        by,
        seriesActivityUpdate({ action: 'cancelled', by, series, from: cancelled }),
      );
      return cancelled;
    },

    async topUpSeries() {
      for (const series of await store.everySeries()) {
        const through = horizonOf(series);
        if (through <= series.madeThrough) continue;
        const dates = repeatDates(
          series.repeat,
          series.starts,
          series.ends,
          through,
          series.madeThrough,
        );
        // A Reminder the clocks push past the start on one day leaves that day out, as a start
        // time they skip does: nobody is there to be told.
        const appointments = dates.flatMap((date) => {
          try {
            return occurrence(series, date) ?? [];
          } catch (error) {
            if (error instanceof CalendarRefusal) return [];
            throw error;
          }
        });
        await addMissing(appointments);
        await store.replaceSeries({ ...series, madeThrough: through });
      }
    },

    // A subscription link changes no Appointment, so it leaves no activity record.
    async makeSubscriptionLink(by) {
      const secret = newSubscriptionSecret();
      const madeAt = clock.now().toISOString();
      await store.keepSubscriptionLink({
        personId: by.person.id,
        hash: await subscriptionHash(secret),
        madeAt,
      });
      return { secret, madeAt };
    },

    async switchOffSubscriptionLink(by) {
      if (await store.subscriptionLinkOf(by.person.id))
        await store.removeSubscriptionLink(by.person.id);
    },

    async subscriptionFeed(secret) {
      if (!isSubscriptionSecret(secret)) return null;
      const link = await store.subscriptionLinkByHash(await subscriptionHash(secret));
      if (!link) return null;
      return calendarFeed(await store.everyAppointment());
    },
  };
}
