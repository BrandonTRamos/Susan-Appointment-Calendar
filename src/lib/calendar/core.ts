// The calendar core: every rule about the calendar, and the only thing that writes calendar data.
// The app, the scheduled run, and later the MCP server, all change the calendar by calling the
// commands here, so none of them can get round a rule.
//
// It reaches the outside world only through its ports (ports.ts) and holds no provider-specific
// code: it runs the same in a backend function, in the browser on sample data, and in a test.

import { failureKind } from '../failure';
import {
  addDays,
  formatDate,
  formatTime,
  isDate,
  isTime,
  localDateTime,
  momentOf,
  momentOrSkipped,
} from '../localTime';
import { activityUpdate, seriesActivityUpdate } from './activityUpdate';
import { alertFor, alertMarked, deliveredText, type DeliveryOutcome } from './alerts';
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
import {
  changeNoticeCutoff,
  changeNoticeOwed,
  differsFrom,
  lastTold,
  toldOf,
} from './changeNotices';
import { calendarFeed } from './feed';
import type {
  AdminMessenger,
  AppNotification,
  Clock,
  Deliveries,
  DeliveryReport,
  Store,
  TextSender,
} from './ports';
import { changeNoticeWords, reminderDue, reminderWords, STARTING_REMINDER } from './reminders';
import { holdsWebAddress } from './webAddress';
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
  type SeriesPlace,
  type SeriesReminder,
} from './series';
import {
  isSubscriptionSecret,
  newSubscriptionSecret,
  subscriptionHash,
  type MadeSubscriptionLink,
} from './subscription';
import {
  ALERT_ATTEMPTS,
  mayHaveReachedSusan,
  reminderPlan,
  reminderTextId,
  RETRY_AFTER,
  SEND_ATTEMPTS,
  STATUS_READS_AT_ONCE,
  TEST_TEXT_WORDS,
  testTextId,
  UNCONFIRMED_AFTER,
  usPhoneNumber,
  type CalendarSettings,
  type Text,
  type TextReason,
} from './texts';

/** Why a command was refused. */
export type RefusalReason =
  /** The details given do not make an Appointment. */
  | 'invalid'
  /** The calendar has no such Appointment. */
  | 'missing'
  /** The Appointment is cancelled. */
  | 'cancelled'
  /** Susan has been texted about the Appointment. */
  | 'texted'
  /** Susan's mobile number is not set, so no text can be sent. */
  | 'noNumber';

/**
 * What a refusal can point at: one detail, the Reminders, how a Series repeats or ends, or one of
 * the settings.
 */
export type RefusalField = Detail | 'reminders' | 'repeat' | 'ends' | SettingName;

/** The settings a person can change. */
export type SettingName = 'susansNumber' | 'contactName' | 'contactPhone';
export type SettingsChanges = Partial<Record<SettingName, string | null>>;

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

  /**
   * Changes where texts go and who Susan is told to call. A setting left out stays as it is; null
   * or empty words clear one. Numbers are US numbers, kept as '+1' and ten digits.
   */
  changeSettings(by: Actor, changes: SettingsChanges): Promise<CalendarSettings>;
  /**
   * Sends Susan a test text now, by the same path as every other text, and answers with its record.
   * Refused while her mobile number is not set.
   */
  sendTestText(by: Actor): Promise<Text>;
  /**
   * The scheduled run: sends every text that is due, each once, and tries again any that might not
   * have gone. Answers with the record of each text it sent, tried or recorded as not sent.
   *
   * A Change notice is sent once an Appointment that Susan has been texted about differs from what
   * she was last told, by its date and time or by being cancelled, a settling period after its last
   * edit, and overnight not before 7:00 am unless its old or new time comes first
   * (changeNotices.ts). It goes before any Reminder due in the same run.
   *
   * A due Reminder is sent; one found overdue is still sent while its Appointment has not started,
   * and recorded as not sent once it has. One whose time had already passed when it was set is never
   * sent and leaves no record. Nothing is sent for a cancelled Appointment, and while Susan's
   * number is not set each text that comes due is recorded as not sent. No text holding a web
   * address is ever sent.
   *
   * It then asks the text sender what became of each text that is sent but not yet settled: one is
   * marked delivered or failed as the sender says, and one with no confirmation of delivery by
   * `unconfirmedAfter` after it was sent is marked failed as not confirmed delivered. A text the
   * sender gave no name to cannot be asked about, and stays sent.
   */
  runDue(): Promise<Text[]>;
  /**
   * What became of a text after the text sender took it, in provider-neutral words: delivered,
   * reported not delivered, or never confirmed delivered in the time allowed. The same transition
   * the scheduled run makes from what the text sender says (runDue). Only a text still recorded as
   * sent is changed, once; anything else is ignored and answers null. A text that did not get
   * through raises an Alert, sent at once. Answers with its record as it now is.
   */
  recordDelivery(report: { textId: string; outcome: DeliveryOutcome }): Promise<Text | null>;
}

export interface CalendarCoreOptions {
  store: Store;
  clock: Clock;
  messenger: AdminMessenger;
  /** How texts reach Susan's phone. */
  textSender: TextSender;
  /** Susan's time zone, from resolveTimeZone (src/lib/timeZone.ts). */
  timeZone: string;
  /**
   * How long after it was sent a text with no confirmation of delivery is marked failed as not
   * confirmed delivered, in milliseconds: UNCONFIRMED_AFTER unless the deploy sets another.
   */
  unconfirmedAfter?: number;
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

/**
 * Everything a person set about a Reminder, and when it goes out, as one string. When its time was
 * set is left out: on its own, that is no change anyone made.
 */
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

/** Does `each` for every item, with no more than `atOnce` under way at a time. */
async function fewAtATime<T>(
  items: readonly T[],
  atOnce: number,
  each: (item: T) => Promise<void>,
) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await each(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, items.length) }, worker));
}

/** A contact's name: one line, kept short. */
const CONTACT_NAME_LIMIT = 80;

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
  textSender,
  timeZone,
  unconfirmedAfter = UNCONFIRMED_AFTER,
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
   * Whether a Reminder that follows its Appointment goes out at a clock time the clocks skip that
   * night, so that it goes out later than set (reminderDue moves it on by their jump).
   */
  function skipsTime(timing: ReminderTiming, { date, time }: AppointmentDetails): boolean {
    if (timing.shape === 'daysBefore')
      return momentOf(addDays(date, -timing.days), timing.time, timeZone) === null;
    if (timing.shape === 'before' && timing.unit === 'days')
      return momentOf(addDays(date, -timing.amount), time, timeZone) === null;
    return false;
  }

  /**
   * The Reminders an Appointment will have, from those sent, or a refusal naming the one that is
   * wrong. `before` are the ones it had, and `moved` whether its date or time is changing. `at` is
   * now, and `current` the Appointment as it was, when it is being changed.
   */
  function settled(
    sent: unknown,
    details: AppointmentDetails,
    startsAt: string,
    before: readonly Reminder[],
    moved: boolean,
    at: string,
    current?: Appointment,
    holdJumps = false,
    startJumped = false,
  ): Reminder[] {
    // A Reminder kept before the calendar recorded when each was set takes the Appointment's last
    // save as that moment, once this save would otherwise move it on. Not for an Appointment that
    // has started: nothing was going to send its Reminders, and they stay as they were.
    const lastSave =
      current && current.startsAt > at ? (current.lastChanged ?? current.added).at : null;
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
      const due = reminderDue(timing, details, timeZone);
      if (!due && timing.shape === 'at')
        wrong(
          `There is no ${formatTime(timing.time)} on ${formatDate(timing.date)}: the clocks go forward that night. Pick another time.`,
        );
      if (!due) return wrong('It could not be worked out.');
      const late = due.toISOString() >= startsAt;
      // The clocks, going forward, put it at or after the start: they moved the start on, or the
      // time it goes out was one they skip. Only that can be held; any other lateness is refused.
      const jumped = late && timing.shape !== 'at' && (startJumped || skipsTime(timing, details));
      // An exact time stays put when the Appointment moves, so a person has to look at it again.
      // So does one that follows the Appointment, on one a Series made (holdJumps), that the clocks
      // put at or after its start: it is held, never sent, until it is changed or removed, and
      // stays held while it would still go out that late.
      const needsReview =
        (timing.shape === 'at' && same && (moved || (was.needsReview && reviewed !== true))) ||
        (holdJumps && jumped) ||
        (late && timing.shape !== 'at' && same && was.needsReview && !reviewed);
      if (!needsReview && late)
        wrong('It would go out after the Appointment starts. Pick an earlier time.');
      const reminderId = was?.id ?? crypto.randomUUID();
      taken.add(reminderId);
      const dueAt = due.toISOString();
      // Its time was worked out again unless it is the same Reminder at the same time, not just
      // confirmed: an edit that leaves its time alone leaves alone when it was set.
      const confirmed = was?.needsReview === true && !needsReview;
      const setAt = same && was.dueAt === dueAt && !confirmed ? (was.setAt ?? lastSave) : at;
      return { id: reminderId, ...timing, dueAt, needsReview, setAt };
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
      // Fixed words only: the error is not repeated (src/lib/failure.ts).
      console.error(`Activity update could not be sent (${failureKind(error)})`);
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
   * The Appointment a Series has on a date: a new one, or `was` given the Series' details. A new
   * one is added by whoever added the Series; one changed in place is stamped as changed by `by`.
   *
   * `entered` is for the date a person gave the Series' time for: its first, as they typed it.
   * That start and its Reminders follow the rules for any Appointment, checked before this. On
   * any other date the Series' time is worked out, so the night the clocks skip it the Appointment
   * still happens, moved on by their jump and saying so (shiftedFrom), and a Reminder the jump puts
   * at or after its start is held for review instead of refused.
   */
  function occurrence(
    series: Series,
    date: string,
    was?: Appointment,
    by?: Actor,
    at?: string,
    entered = false,
  ): Appointment {
    // Where the clocks jump across midnight, the moment lands on the next day: the Appointment is
    // on the date and at the time it really starts, and keeps its place in the pattern (`date`).
    const moment = momentOrSkipped(date, series.time, timeZone);
    const local = localDateTime(moment, timeZone);
    const shiftedFrom = local.date === date && local.time === series.time ? null : series.time;
    const details: AppointmentDetails = {
      ...seriesDetailsOf(series),
      date: local.date,
      time: local.time,
    };
    const startsAt = moment.toISOString();
    const before = was?.reminders ?? [];
    // A Reminder with the same timing as one the Appointment has keeps its ID.
    const taken = new Set<string>();
    const settings = series.reminders.map((timing) => {
      const same = before.find((r) => !taken.has(r.id) && timingKey(r) === timingKey(timing));
      if (same) taken.add(same.id);
      return same ? { ...timing, id: same.id } : timing;
    });
    const moved = was !== undefined && (was.date !== details.date || was.time !== details.time);
    // Each Reminder is set when its Appointment is made or changed, by the same rule as any other
    // (settled): one whose time has already passed by then is never sent.
    const now = at ?? clock.now().toISOString();
    const reminders = settled(
      settings,
      details,
      startsAt,
      before,
      moved,
      now,
      was,
      !entered,
      shiftedFrom !== null,
    );
    const place: SeriesPlace = {
      id: series.id,
      date,
      repeat: series.repeat,
      individuallyChanged: false,
      shiftedFrom,
    };
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
    const changed =
      !hasDetails(was, details) ||
      !sameReminders(was.reminders, reminders) ||
      (was.series?.shiftedFrom ?? null) !== shiftedFrom;
    return {
      ...was,
      ...details,
      startsAt,
      reminders,
      series: place,
      lastChanged: changed && by && at ? stamp(by, at) : was.lastChanged,
    };
  }

  /** The Appointments a Series has on these dates. Its first is the one a person entered. */
  const occurrences = (series: Series, dates: string[]) =>
    dates.map((date) =>
      occurrence(series, date, undefined, undefined, undefined, date === series.starts),
    );

  /**
   * Adds the Appointments the calendar does not have yet. Each has an ID made from its Series and
   * date, so one that an earlier, interrupted command or run already added is not added twice.
   */
  const addMissing = (appointments: Appointment[]) =>
    inBatches(appointments, async (appointment) => {
      if (!(await store.appointment(appointment.id))) await store.addAppointment(appointment);
    });

  /**
   * Takes an Appointment out of the calendar because its Series no longer has it: removed, or kept
   * and cancelled when Susan has been texted about it, so that she can be told it is off.
   */
  async function withdraw(appointment: Appointment, cancelled: Stamp | null) {
    // Susan may have been texted about it, as for deleting one (deleteAppointment).
    if (!(await store.textsAbout(appointment.id)).some(mayHaveReachedSusan)) {
      await store.removeAppointment(appointment.id);
    } else if (appointment.state === 'active') {
      await store.replaceAppointment({
        ...appointment,
        state: 'cancelled',
        lastChanged: cancelled ?? appointment.lastChanged,
      });
    }
  }

  /**
   * The ID of the Series that continues one from a date on, after "this and all later ones". The
   * same change gives the same ID, and the Series it continues can be read from it.
   */
  const continuationId = (seriesId: string, date: string) => `${seriesId}-from-${date}`;

  /**
   * One line of Series from a date on: a Series, and every Series continued from it on that date
   * or later, theirs included. A change or cancellation from that date is for all of them.
   */
  async function lineFrom(series: Series, date: string): Promise<Series[]> {
    const prefix = `${series.id}-from-`;
    const continued = (await store.everySeries()).filter(
      (each) =>
        each.id.startsWith(prefix) && each.id.slice(prefix.length, prefix.length + 10) >= date,
    );
    return [series, ...continued];
  }

  /**
   * The Appointments of a line of Series from a date on, in date order: the first Series' from
   * that date, and all of the rest's, which all come after it.
   */
  async function appointmentsInLine(line: Series[], date: string): Promise<Appointment[]> {
    const ids = new Set(line.map((series) => series.id));
    const [first] = line;
    return inDateOrder(
      (await store.everyAppointment()).filter(
        ({ series: place }) =>
          place && ids.has(place.id) && (place.id !== first.id || place.date >= date),
      ),
    );
  }

  /** Ends every Series in a line the day before a date, leaving one that already ends earlier. */
  const endLine = (line: Series[], date: string, by: Actor, at: string) => {
    const ends = addDays(date, -1);
    return inBatches(
      line.filter((series) => series.ends === null || series.ends > ends),
      (series) => store.replaceSeries({ ...series, ends, lastChanged: stamp(by, at) }),
    );
  };

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
      const now = clock.now().toISOString();
      const reminders = settled(asked ?? [STARTING_REMINDER], details, startsAt, [], false, now);
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
      const at = now;
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
      const at = clock.now().toISOString();
      const reminders = settled(
        asked ?? current.reminders,
        details,
        startsAt,
        current.reminders,
        moved,
        at,
        current,
      );
      if (hasDetails(current, details) && sameReminders(current.reminders, reminders))
        return current;
      const appointment: Appointment = {
        ...current,
        ...details,
        startsAt,
        reminders,
        // Changed only this one: the rest of its Series is as it was.
        series: current.series && {
          ...current.series,
          individuallyChanged: true,
          // Once someone sets its date or time, the clocks no longer moved it.
          shiftedFrom: moved ? null : (current.series.shiftedFrom ?? null),
        },
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
      if ((await store.textsAbout(current.id)).some(mayHaveReachedSusan))
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
      const line = await lineFrom(old, place.date);
      // The new Series has the same ID whenever this change is sent, so that one cut off partway
      // finds what it had done when it is sent again.
      const nextId = continuationId(old.id, place.date);
      const continued = line.find((series) => series.id === nextId);
      // What is not changed stays as the Series has it, which puts back what was changed on its own.
      const typed = given(sent);
      const details = checked({ ...seriesDetailsOf(old), date: place.date, ...typed });
      // A date or time sent with the change is one a person entered, so it must be a real start,
      // as for any Appointment. One taken from the Series is its regular time, which on the night
      // the clocks skip it is moved on like any Series date (occurrence).
      const entered = typed.date !== undefined || typed.time !== undefined;
      if (entered) startOf(details);
      const starts = details.date;
      const asked = sent as Partial<Record<string, unknown>>;
      let repeat: Repeat;
      if (asked.repeat !== undefined) repeat = repeatOf(asked.repeat, starts);
      else if (old.repeat.every === 'month' && starts !== place.date)
        repeat = { ...old.repeat, day: dayOfMonth(starts) };
      else repeat = onItsFirstDay(old.repeat, starts);
      // With no new end given, it ends where the line was going to: the end of its last Series
      // still running, not the end a later split, or this one cut off partway, gave the old one.
      const running = line.filter(
        (series) => !(series.ends !== null && series.ends < series.starts),
      );
      const tail = running.reduce(
        (last, series) => (series.starts > last.starts ? series : last),
        old,
      );
      const ends = 'ends' in asked ? endsOf(asked.ends, starts) : tail.ends;
      if (ends && ends < starts)
        invalid(`It would end before its first Appointment, on ${formatDate(starts)}.`, 'ends');
      const reminders =
        asked.reminders !== undefined ? seriesRemindersOf(asked.reminders) : old.reminders;
      if (
        line.length === 1 &&
        starts === place.date &&
        sameDetails(seriesDetailsOf(details), old) &&
        sameRepeat(repeat, old.repeat) &&
        ends === old.ends &&
        sameTimings(reminders, old.reminders)
      )
        return picked;

      const at = clock.now().toISOString();
      const next: Series = {
        id: nextId,
        ...seriesDetailsOf(details),
        repeat,
        starts,
        ends,
        reminders,
        madeThrough: '',
        added: continued?.added ?? stamp(by, at),
        lastChanged: null,
      };
      next.madeThrough = horizonOf(next);
      const dates = repeatDates(repeat, starts, ends, next.madeThrough);
      // Every Appointment the new Series will have is worked out before anything is written, so
      // that a change the core refuses, such as one that would put a Reminder at or after the start,
      // changes nothing. Its Reminders follow each Appointment and none is at an exact time, so one
      // changed in place below is refused exactly when a new one on its date is.
      for (const date of dates)
        occurrence(next, date, undefined, by, at, entered && date === starts);
      // The new Series is written first, with the end it keeps, so that a change cut off after
      // this point still knows it when sent again. Then the old line is ended here, before its
      // Appointments are read, so that a top-up running now either makes its Appointments before
      // they are read, or sees the end and makes none past it (topUpSeries).
      await (continued ? store.replaceSeries(next) : store.addSeries(next));
      await endLine(
        line.filter((series) => series.id !== nextId),
        place.date,
        by,
        at,
      );
      const later = (await appointmentsInLine(line, place.date)).filter(
        (appointment) => appointment.id !== picked.id,
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
        const appointment = occurrence(next, date, was, by, at, entered && date === starts);
        (was ? reused : made).push(appointment);
      }
      const kept = new Set(reused.map((appointment) => appointment.id));
      const replaced = later.filter((appointment) => !kept.has(appointment.id));
      const changed = reused.find((appointment) => appointment.id === picked.id)!;

      await inBatches(replaced, (appointment) => withdraw(appointment, stamp(by, at)));
      await inBatches(
        reused.filter((appointment) => appointment.id !== picked.id),
        (appointment) => store.replaceAppointment(appointment),
      );
      await addMissing(made);
      // This one last: until it is moved, sending the change again carries it out from the start.
      await store.replaceAppointment(changed);
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
      const line = await lineFrom(series, place.date);
      const at = clock.now().toISOString();
      const cancel = (appointment: Appointment): Appointment => ({
        ...appointment,
        state: 'cancelled',
        lastChanged: stamp(by, at),
      });
      // The line is ended first, as in changeSeries, so that a top-up running now makes nothing
      // after it that this does not cancel.
      await endLine(line, place.date, by, at);
      const later = (await appointmentsInLine(line, place.date)).filter(
        (appointment) => appointment.id !== picked.id && appointment.state === 'active',
      );
      await inBatches(later.map(cancel), (appointment) => store.replaceAppointment(appointment));
      // This one last: until it is cancelled, sending this again carries it out from the start.
      const cancelled = cancel(picked);
      await store.replaceAppointment(cancelled);
      await record('cancelled', cancelled, by, at, series.id);
      await tellOtherAdmins(
        by,
        seriesActivityUpdate({ action: 'cancelled', by, series, from: cancelled }),
      );
      return cancelled;
    },

    async topUpSeries() {
      for (const listed of await store.everySeries()) {
        // Read afresh, since an earlier Series may have taken a while.
        const series = await store.series(listed.id);
        if (!series) continue;
        const through = horizonOf(series);
        if (through <= series.madeThrough) continue;
        const dates = repeatDates(
          series.repeat,
          series.starts,
          series.ends,
          through,
          series.madeThrough,
        );
        // None of these is left out: one the clocks skip is moved on by their jump, and a Reminder
        // they put at or after its start is held (occurrence). Anything else that fails fails
        // the run, which is logged, and the next day's catches up.
        const appointments = occurrences(series, dates);
        const made: Appointment[] = [];
        await inBatches(appointments, async (appointment) => {
          if (await store.appointment(appointment.id)) return;
          await store.addAppointment(appointment);
          made.push(appointment);
        });
        // The Series may have been ended or split while these were made, after the command that
        // did it read its Appointments. It writes the end before it reads them, so reading the
        // Series again now finds that end: whatever was made after it is taken out again.
        const now = await store.series(series.id);
        if (!now) continue;
        const { ends } = now;
        if (ends)
          await inBatches(
            // By its date in the pattern, as an end is: one the clocks moved past midnight on
            // the Series' last date is still in it.
            made.filter(({ series: place }) => place!.date > ends),
            (appointment) => withdraw(appointment, null),
          );
        // Only how far it is made is written, onto the Series as it now is.
        if (through > now.madeThrough) await store.replaceSeries({ ...now, madeThrough: through });
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

    // Settings change no Appointment, so they leave no activity record.
    async changeSettings(by, sent) {
      if (typeof sent !== 'object' || sent === null || Array.isArray(sent))
        invalid('The settings could not be read.');
      const current = await store.settings();
      const next = { ...current };
      const given = sent as Record<string, unknown>;
      for (const name of ['susansNumber', 'contactPhone'] as const) {
        const value = given[name];
        if (value === undefined) continue;
        if (value !== null && typeof value !== 'string')
          invalid('Write the number in digits.', name);
        const typed = value?.trim() ?? '';
        if (!typed) {
          next[name] = null;
          continue;
        }
        const number = usPhoneNumber(typed);
        if (!number)
          invalid(
            name === 'susansNumber'
              ? 'That is not a US mobile number. Enter its 10 digits, area code first.'
              : 'That is not a US phone number. Enter its 10 digits, area code first.',
            name,
          );
        next[name] = number;
      }
      if (given.contactName !== undefined) {
        const value = given.contactName;
        if (value !== null && typeof value !== 'string')
          invalid('Write the name in words.', 'contactName');
        const name = (value ?? '').replace(UNSEEN, '').replace(/\s+/g, ' ').trim();
        if (name.length > CONTACT_NAME_LIMIT)
          invalid(`Keep the name to ${CONTACT_NAME_LIMIT} characters or fewer.`, 'contactName');
        next.contactName = name || null;
      }
      const same =
        next.susansNumber === current.susansNumber &&
        next.contactName === current.contactName &&
        next.contactPhone === current.contactPhone;
      if (same) return current;
      const changed: CalendarSettings = {
        ...next,
        lastChanged: stamp(by, clock.now().toISOString()),
      };
      await store.keepSettings(changed);
      return changed;
    },

    async sendTestText() {
      const { susansNumber } = await store.settings();
      if (!susansNumber)
        throw new CalendarRefusal(
          'noNumber',
          "Enter Susan's mobile number first. Nothing is sent until it is set.",
          'susansNumber',
        );
      const at = clock.now().toISOString();
      const text = newText({
        id: testTextId(at),
        kind: 'test',
        appointmentId: null,
        reminderId: null,
        words: TEST_TEXT_WORDS,
        dueAt: at,
        told: null,
      });
      if (!(await store.claimText(text)))
        throw new CalendarRefusal('invalid', 'A test text was sent just now. Wait a moment.');
      return attempt(text, susansNumber, { startsAt: null, tried: 0 });
    },

    async runDue() {
      const now = clock.now();
      const at = now.toISOString();
      const [appointments, texts, { susansNumber }] = await Promise.all([
        store.everyAppointment(),
        store.everyText(),
        store.settings(),
      ]);
      const kept = new Map(texts.map((text) => [text.id, text]));
      const done: Text[] = [];
      /** Keeps what became of a text, so that later decisions in this run see it. */
      const did = (text: Text) => {
        kept.set(text.id, text);
        done.push(text);
      };

      // Texts that were tried and might not have gone, and claims a run left behind.
      const waiting = texts
        .filter((text) => text.status === 'waiting')
        .filter((text) => Date.parse(text.triedAt) <= now.getTime() - RETRY_AFTER)
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      for (const text of waiting) {
        const retry = retrying(text, appointments, texts, now, Boolean(susansNumber));
        if (retry === 'hold') continue;
        // Taken up only if no other run has taken it up since it was read.
        const next: Text = alertMarked(
          'reason' in retry
            ? { ...text, status: 'failed', reason: retry.reason, triedAt: at }
            : {
                ...text,
                words: retry.words,
                told: retry.told,
                attempts: text.attempts + 1,
                triedAt: at,
              },
        );
        if (!(await store.retakeText(next, text))) continue;
        if ('reason' in retry) {
          did(next);
          continue;
        }
        did(await attempt(next, susansNumber!, { startsAt: retry.cutoff, tried: text.attempts }));
      }

      // Change notices that have come due: before Reminders, so that she hears of a change first.
      for (const appointment of appointments) {
        const notice = changeNoticeOwed(appointment, [...kept.values()], now, timeZone);
        if (!notice || notice.plan === 'later' || kept.has(notice.id)) continue;
        const text = newText({
          id: notice.id,
          kind: 'changeNotice',
          appointmentId: appointment.id,
          reminderId: null,
          // The days in words are right for the moment it goes out.
          words: changeNoticeWords(
            appointment,
            notice,
            { dueAt: notice.plan === 'send' ? at : notice.dueAt },
            timeZone,
          ),
          dueAt: notice.dueAt,
          told: notice.told,
        });
        if (notice.plan === 'tooLate' || !susansNumber) {
          const reason: TextReason = notice.plan === 'tooLate' ? 'tooLate' : 'noNumber';
          const notSent = alertMarked({ ...text, status: 'notSent', reason, attempts: 0 });
          if (await store.claimText(notSent)) did(notSent);
          continue;
        }
        if (!(await store.claimText(text))) continue;
        did(await attempt(text, susansNumber, { startsAt: notice.cutoff, tried: 0 }));
      }

      // Reminders that have come due.
      const due = appointments
        .flatMap((appointment) =>
          appointment.reminders.map((reminder) => ({ appointment, reminder })),
        )
        .sort((a, b) => a.reminder.dueAt.localeCompare(b.reminder.dueAt));
      for (const { appointment, reminder } of due) {
        const plan = reminderPlan(appointment, reminder, now);
        if (plan !== 'send' && plan !== 'tooLate') continue;
        const id = reminderTextId(appointment, reminder);
        if (kept.has(id)) continue;
        const text = newText({
          id,
          kind: 'reminder',
          appointmentId: appointment.id,
          reminderId: reminder.id,
          // The day in words is right for the moment it goes out, which is now if it is late.
          words: reminderWords(
            appointment,
            { dueAt: plan === 'send' ? at : reminder.dueAt },
            timeZone,
          ),
          dueAt: reminder.dueAt,
          told: toldOf(appointment),
        });
        if (plan === 'tooLate' || !susansNumber) {
          const reason: TextReason = plan === 'tooLate' ? 'tooLate' : 'noNumber';
          const notSent = alertMarked({ ...text, status: 'notSent', reason, attempts: 0 });
          if (await store.claimText(notSent)) did(notSent);
          continue;
        }
        if (!(await store.claimText(text))) continue;
        did(await attempt(text, susansNumber, { startsAt: appointment.startsAt, tried: 0 }));
      }

      // Texts sent and not yet settled: what became of each, as the text sender now says. Only
      // after every send, which go one at a time; these are asked a few at a time, the oldest
      // first, and each is recorded as soon as its answer comes, so a slow answer holds up nothing
      // else and a run cut short keeps what it learned. Each is settled once, by a write that
      // finds it still sent; one that did not get through has its Alert marked due in that same
      // write, and sent below with the rest, one at a time, once every answer is in.
      const unsettled = texts
        .filter((text) => text.status === 'sent' && text.reference !== null)
        .sort((a, b) => (a.sentAt ?? a.triedAt).localeCompare(b.sentAt ?? b.triedAt));
      await fewAtATime(unsettled, STATUS_READS_AT_ONCE, async (text) => {
        const outcome = await settle(text, text.reference!);
        if (!outcome) return;
        const settled = deliveredText(text, outcome);
        if (await store.changeText(settled, text)) done.push(settled);
      });

      // Alerts about the texts this run settled, and any left due or held by an earlier run.
      const latest = new Map(texts.map((text) => [text.id, text]));
      for (const text of done) latest.set(text.id, text);
      await raiseAlerts([...latest.values()], appointments);
      return done;
    },

    async recordDelivery({ textId, outcome }) {
      const text = (await store.everyText()).find((each) => each.id === textId);
      if (text?.status !== 'sent') return null;
      const next = deliveredText(text, outcome);
      // Only if no other run has settled it since it was read.
      if (!(await store.changeText(next, text))) return null;
      const appointment = next.appointmentId ? await store.appointment(next.appointmentId) : null;
      await raiseAlerts([next], appointment ? [appointment] : []);
      return next;
    },
  };

  /**
   * Sends each Alert among these texts that is ready: one that is due and not tried, one due again
   * RETRY_AFTER after a try in which a delivery failed, and one a run took up and stopped on. Each
   * text has one Alert, sent by one run at a time.
   */
  async function raiseAlerts(texts: readonly Text[], appointments: readonly Appointment[]) {
    const now = clock.now().getTime();
    const ready = texts
      .filter(({ alert }) => {
        if (!alert || alert.state === 'raised') return false;
        if (alert.triedAt === null) return alert.state === 'due';
        return Date.parse(alert.triedAt) <= now - RETRY_AFTER;
      })
      .sort((a, b) => a.triedAt.localeCompare(b.triedAt) || a.id.localeCompare(b.id));
    for (const text of ready) await raiseAlert(text, appointments);
  }

  /**
   * Records an Alert as raised without sending anything, because a run already took it up
   * ALERT_ATTEMPTS times: the last of them stopped before it could say how it went. What had not
   * been recorded as sent by then is given up. Logged in fixed words: how many deliveries had gone
   * and how many were refused, never to whom.
   */
  async function giveUpAlert(text: Text) {
    const alert = text.alert!;
    try {
      if (!(await store.changeText({ ...text, alert: { ...alert, state: 'raised' } }, text)))
        return;
      console.error(
        `Alert gave up after ${alert.tries} tries, the last stopped part way (sent ${alert.sent.length}, refused ${alert.refused.length})`,
      );
    } catch (error) {
      console.error(`Alert record could not be sent (${failureKind(error)})`);
    }
  }

  /**
   * Sends one Alert to every Admin, by email and by app notification. Susan is not an Admin, so she
   * is never told. The run takes it up by a write that finds it as it was read, so two runs cannot
   * both send it, then sends each delivery the messenger has not already made, one Admin and one
   * channel at a time, and records each that went, or was refused for good, as soon as it has. A
   * delivery that failed is tried again by a later run, up to ALERT_ATTEMPTS take-ups in all, a run
   * that stopped part way included; one refused for good, or with nothing to reach (a channel not
   * set up, no device), is not. If the run stops part way, a later run takes it up and sends only
   * what had not been recorded. The one repeat that can happen: a delivery the email or push
   * service accepted just before the run stopped, before its record was written, is sent again by
   * the run that takes over. What broke is logged in fixed words, without the Appointment or the
   * text.
   */
  async function raiseAlert(text: Text, appointments: readonly Appointment[]) {
    const alert = text.alert!;
    // The cap holds for a run that stopped part way too: a claim left at the last try is not taken
    // up a further time.
    if (alert.tries >= ALERT_ATTEMPTS) return giveUpAlert(text);
    let held: Text = {
      ...text,
      alert: {
        ...alert,
        state: 'sending',
        tries: alert.tries + 1,
        triedAt: clock.now().toISOString(),
      },
    };
    const keep = async (next: Text) => {
      if (!(await store.changeText(next, held))) return false;
      held = next;
      return true;
    };
    const failed = (what: string, error: unknown) =>
      console.error(`Alert ${what} could not be sent (${failureKind(error)})`);
    try {
      if (!(await store.changeText(held, text))) return;
    } catch (error) {
      failed('record', error);
      return;
    }
    const appointment = appointments.find((each) => each.id === text.appointmentId) ?? null;
    const { email, notification } = alertFor(text, appointment, timeZone);
    let retry = false;
    try {
      for (const admin of [...new Set(await messenger.admins())]) {
        for (const channel of ['email', 'app notification'] as const) {
          // Leaves out what went, and what was refused for good: neither is sent again.
          const skip = [...held.alert!.sent, ...held.alert!.refused];
          let went: Deliveries;
          try {
            went =
              channel === 'email'
                ? await messenger.sendEmail([admin], email, skip)
                : await messenger.sendAppNotification([admin], notification, skip);
          } catch (error) {
            failed(channel, error);
            retry = true;
            continue;
          }
          if (went.failed.length) {
            console.error(`Alert ${channel} could not be sent (failed ${went.failed.length})`);
            retry = true;
          }
          if (went.refused.length)
            console.error(`Alert ${channel} was refused (refused ${went.refused.length})`);
          if (went.sent.length === 0 && went.refused.length === 0) continue;
          const { sent, refused } = held.alert!;
          const next = {
            ...held.alert!,
            sent: [...new Set([...sent, ...went.sent])],
            refused: [...new Set([...refused, ...went.refused])],
          };
          // Another run took it up: this one had stopped too long. It sends what is left.
          if (!(await keep({ ...held, alert: next }))) return;
        }
      }
    } catch (error) {
      failed('delivery', error);
      retry = true;
    }
    const giveUp = retry && held.alert!.tries >= ALERT_ATTEMPTS;
    if (giveUp) console.error('Alert gave up on deliveries that kept failing');
    const state = retry && !giveUp ? 'due' : 'raised';
    await keep({ ...held, alert: { ...held.alert!, state } }).catch((error: unknown) =>
      failed('record', error),
    );
  }

  /**
   * What to do with a text that was tried and might not have gone, now that it is due to be tried
   * again: try it, with the words it would now have and the moment past which it is too late; hold
   * it; or give it up as failed, since its earlier try may still have reached Susan. A Reminder is
   * tried again only while it is still the same Reminder at the same time, on an Appointment that
   * is active and has not started, and not while it is flagged for review. A Change notice is tried
   * again only while the Appointment is still as it tells her, and its old or new time is to come.
   */
  function retrying(
    text: Text,
    appointments: readonly Appointment[],
    texts: readonly Text[],
    now: Date,
    numberSet: boolean,
  ):
    'hold' | { reason: TextReason } | { words: string; told: Text['told']; cutoff: string | null } {
    if (text.attempts >= SEND_ATTEMPTS) return { reason: 'gaveUp' };
    if (text.kind === 'changeNotice')
      return retryingNotice(text, appointments, texts, now, numberSet);
    if (text.kind !== 'reminder')
      return numberSet
        ? { words: text.words, told: text.told, cutoff: null }
        : { reason: 'noNumber' };
    const appointment = appointments.find((each) => each.id === text.appointmentId);
    if (!appointment || appointment.state !== 'active') return { reason: 'cancelled' };
    if (now.toISOString() >= appointment.startsAt) return { reason: 'tooLate' };
    const reminder = appointment.reminders.find((each) => each.id === text.reminderId);
    if (!reminder || reminderTextId(appointment, reminder) !== text.id)
      return { reason: 'outdated' };
    const plan = reminderPlan(appointment, reminder, now);
    if (plan === 'heldForReview') return 'hold';
    if (plan !== 'send') return { reason: 'outdated' };
    if (!numberSet) return { reason: 'noNumber' };
    // Its details may have changed since it was first tried: a Reminder carries them as they are.
    return {
      words: reminderWords(appointment, { dueAt: now }, timeZone),
      told: toldOf(appointment),
      cutoff: appointment.startsAt,
    };
  }

  /** What to do with a Change notice that is due to be tried again (see `retrying`). */
  function retryingNotice(
    text: Text,
    appointments: readonly Appointment[],
    texts: readonly Text[],
    now: Date,
    numberSet: boolean,
  ): { reason: TextReason } | { words: string; told: Text['told']; cutoff: string } {
    const appointment = appointments.find((each) => each.id === text.appointmentId);
    // Changed again since: what it says is no longer the outcome. A later notice tells her that.
    if (!appointment || !text.told || differsFrom(text.told, appointment))
      return { reason: 'outdated' };
    const cutoff = changeNoticeCutoff(lastTold(appointment.id, texts, text), text.told, timeZone);
    if (now.toISOString() >= cutoff) return { reason: 'tooLate' };
    if (!numberSet) return { reason: 'noNumber' };
    return { words: text.words, told: text.told, cutoff };
  }

  /**
   * What has become of a sent text, as the text sender says, or null while it is still only sent.
   * When the sender cannot be asked just now, it is asked again on the next run; either way a text
   * with no confirmation by `unconfirmedAfter` after it was sent is failed, not confirmed delivered.
   */
  async function settle(text: Text, reference: string): Promise<DeliveryOutcome | null> {
    let report: DeliveryReport = 'pending';
    try {
      report = await textSender.delivery(reference);
    } catch (error) {
      // Fixed words only: the error is not repeated (src/lib/failure.ts).
      console.error(`Delivery status could not be read (${failureKind(error)})`);
    }
    // The sender's report, in the provider-neutral words the core settles a text by (alerts.ts).
    if (report === 'delivered') return 'delivered';
    if (report === 'failed') return 'undelivered';
    const sentAt = Date.parse(text.sentAt ?? text.triedAt);
    if (clock.now().getTime() - sentAt < unconfirmedAfter) return null;
    return 'unconfirmed';
  }

  /** The record of a text about to be tried for the first time. */
  function newText(
    about: Pick<Text, 'id' | 'kind' | 'appointmentId' | 'reminderId' | 'words' | 'dueAt' | 'told'>,
  ): Text {
    return {
      ...about,
      status: 'waiting',
      reason: null,
      attempts: 1,
      triedAt: clock.now().toISOString(),
      sentAt: null,
      reference: null,
      creditLeft: null,
      alert: null,
    };
  }

  /**
   * Tries to send a text whose record says it is being tried, and records what became of it. When
   * nobody can tell whether it went, it is left waiting to be tried again, until it has been tried
   * SEND_ATTEMPTS times. Words that hold a web address are never sent.
   */
  async function attempt(
    text: Text,
    to: string,
    { startsAt, tried }: { startsAt: string | null; tried: number },
  ): Promise<Text> {
    let next: Text;
    // The cutoff is the Appointment's start as it is at the moment of sending, not when the run
    // began: an earlier slow send can carry the clock past it. Nothing goes once it has started.
    if (startsAt && clock.now().toISOString() >= startsAt) {
      next = alertMarked(
        tried === 0
          ? { ...text, status: 'notSent', reason: 'tooLate', attempts: 0 }
          : { ...text, status: 'failed', reason: 'tooLate', attempts: tried },
      );
      await store.replaceText(next);
      return next;
    }
    // The one place every text passes before it is sent: none holding a web address goes, of any
    // kind. The details it came from are left as the person wrote them; the screens say why.
    if (holdsWebAddress(text.words)) {
      next = alertMarked(
        tried === 0
          ? { ...text, status: 'notSent', reason: 'webAddress', attempts: 0 }
          : { ...text, status: 'failed', reason: 'webAddress', attempts: tried },
      );
      await store.replaceText(next);
      return next;
    }
    try {
      const result = await textSender.send({ to, words: text.words });
      const creditLeft = result.creditLeft ?? null;
      next = result.sent
        ? {
            ...text,
            status: 'sent',
            sentAt: clock.now().toISOString(),
            reference: result.reference,
            creditLeft,
          }
        : { ...text, status: 'failed', reason: 'refused', creditLeft };
    } catch {
      if (text.attempts < SEND_ATTEMPTS) return text;
      next = { ...text, status: 'failed', reason: 'gaveUp' };
    }
    next = alertMarked(next);
    await store.replaceText(next);
    return next;
  }
}
