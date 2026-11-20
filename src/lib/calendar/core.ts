// The calendar core: every rule about the calendar, and the only thing that writes calendar data.
// The app, the scheduled run, and later the MCP server, all change the calendar by calling the
// commands here, so none of them can get round a rule.
//
// It reaches the outside world only through its ports (ports.ts) and holds no provider-specific
// code: it runs the same in a backend function, in the browser on sample data, and in a test.

import { failureKind } from '../failure';
import { formatDate, formatTime, isDate, isTime, momentOf } from '../localTime';
import { activityUpdate } from './activityUpdate';
import {
  DETAIL_NAMES as NAMES,
  DETAILS,
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
  DeliveryReport,
  Store,
  TextSender,
} from './ports';
import { changeNoticeWords, reminderDue, reminderWords, STARTING_REMINDER } from './reminders';
import { holdsWebAddress } from './webAddress';
import {
  isSubscriptionSecret,
  newSubscriptionSecret,
  subscriptionHash,
  type MadeSubscriptionLink,
} from './subscription';
import {
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

/** What a refusal can point at: one detail, the Reminders, or one of the settings. */
export type RefusalField = Detail | 'reminders' | SettingName;

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
    /** The detail that was wrong, when it was one, or 'reminders' when it was a Reminder. */
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

  /** The one activity record a command leaves when it changes the calendar. */
  function record(action: ActivityAction, appointment: Appointment, by: Actor, at: string) {
    const activity: ActivityRecord = {
      id: crypto.randomUUID(),
      ...stamp(by, at),
      action,
      appointmentId: appointment.id,
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
        const next: Text =
          'reason' in retry
            ? { ...text, status: 'failed', reason: retry.reason, triedAt: at }
            : {
                ...text,
                words: retry.words,
                told: retry.told,
                attempts: text.attempts + 1,
                triedAt: at,
              };
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
          const notSent: Text = { ...text, status: 'notSent', reason, attempts: 0 };
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
          const notSent: Text = { ...text, status: 'notSent', reason, attempts: 0 };
          if (await store.claimText(notSent)) did(notSent);
          continue;
        }
        if (!(await store.claimText(text))) continue;
        did(await attempt(text, susansNumber, { startsAt: appointment.startsAt, tried: 0 }));
      }

      // Texts sent and not yet settled: what became of each, as the text sender now says. Only
      // after every send, which go one at a time; these are asked a few at a time, the oldest
      // first, and each is recorded as soon as its answer comes, so a slow answer holds up nothing
      // else and a run cut short keeps what it learned.
      const unsettled = texts
        .filter((text) => text.status === 'sent' && text.reference !== null)
        .sort((a, b) => (a.sentAt ?? a.triedAt).localeCompare(b.sentAt ?? b.triedAt));
      await fewAtATime(unsettled, STATUS_READS_AT_ONCE, async (text) => {
        const settled = await settle(text, text.reference!);
        if (!settled) return;
        await store.replaceText(settled);
        done.push(settled);
      });
      return done;
    },
  };

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
   * What a sent text has become, as the text sender says, or null while it is still only sent.
   * When the sender cannot be asked just now, it is asked again on the next run; either way a text
   * with no confirmation by `unconfirmedAfter` after it was sent is failed, not confirmed delivered.
   */
  async function settle(text: Text, reference: string): Promise<Text | null> {
    let report: DeliveryReport = 'pending';
    try {
      report = await textSender.delivery(reference);
    } catch (error) {
      // Fixed words only: the error is not repeated (src/lib/failure.ts).
      console.error(`Delivery status could not be read (${failureKind(error)})`);
    }
    if (report === 'delivered') return { ...text, status: 'delivered', reason: null };
    if (report === 'failed') return { ...text, status: 'failed', reason: 'undelivered' };
    const sentAt = Date.parse(text.sentAt ?? text.triedAt);
    if (clock.now().getTime() - sentAt < unconfirmedAfter) return null;
    return { ...text, status: 'failed', reason: 'unconfirmed' };
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
      next =
        tried === 0
          ? { ...text, status: 'notSent', reason: 'tooLate', attempts: 0 }
          : { ...text, status: 'failed', reason: 'tooLate', attempts: tried };
      await store.replaceText(next);
      return next;
    }
    // The one place every text passes before it is sent: none holding a web address goes, of any
    // kind. The details it came from are left as the person wrote them; the screens say why.
    if (holdsWebAddress(text.words)) {
      next =
        tried === 0
          ? { ...text, status: 'notSent', reason: 'webAddress', attempts: 0 }
          : { ...text, status: 'failed', reason: 'webAddress', attempts: tried };
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
    await store.replaceText(next);
    return next;
  }
}
