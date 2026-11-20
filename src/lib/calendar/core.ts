// The calendar core: every rule about the calendar, and the only thing that writes calendar data.
// The app, and later the MCP server and the scheduled run, all change the calendar by calling the
// commands here, so none of them can get round a rule.
//
// It reaches the outside world only through its ports (ports.ts) and holds no provider-specific
// code: it runs the same in a backend function, in the browser on sample data, and in a test.

import { formatDate, formatTime, isDate, isTime, momentOf } from '../localTime';
import {
  DETAILS,
  type ActivityAction,
  type ActivityRecord,
  type Actor,
  type Appointment,
  type AppointmentChanges,
  type AppointmentDetails,
  type Detail,
  type NewAppointment,
  type Stamp,
} from './appointment';
import type { Clock, Store } from './ports';

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

/**
 * A command the core would not carry out. Nothing was changed. The message is written for the
 * person who asked, and says what to do next; it holds nothing about the Appointment beyond what
 * they sent.
 */
export class CalendarRefusal extends Error {
  constructor(
    readonly reason: RefusalReason,
    message: string,
    /** The detail that was wrong, when it was one. */
    readonly detail?: Detail,
  ) {
    super(message);
    this.name = 'CalendarRefusal';
  }
}

export interface CalendarCore {
  /**
   * Adds an Appointment. It needs what it is, its date and its start time.
   *
   * Whoever sends the command can give the new Appointment its ID, a UUID. Then the same add
   * arriving twice, as when the answer to the first was lost on the way back, is carried out once.
   */
  addAppointment(by: Actor, details: NewAppointment, id?: string | null): Promise<Appointment>;
  /**
   * Changes the details given; the rest stay as they were. Refused for a cancelled Appointment.
   * Changes that leave the Appointment as it is do nothing: nobody changed it.
   */
  changeAppointment(by: Actor, id: string, changes: AppointmentChanges): Promise<Appointment>;
  /** Marks the Appointment cancelled. It stays in the calendar. */
  cancelAppointment(by: Actor, id: string): Promise<Appointment>;
  /**
   * Removes an Appointment entered by mistake. Refused once any text about it has gone to Susan:
   * cancel it instead, so that she is told.
   */
  deleteAppointment(by: Actor, id: string): Promise<void>;
}

export interface CalendarCoreOptions {
  store: Store;
  clock: Clock;
  /** Susan's time zone, from resolveTimeZone (src/lib/timeZone.ts). */
  timeZone: string;
}

/** How each detail is named to a person. */
const NAMES: Record<Detail, string> = {
  what: 'what it is',
  date: 'the date',
  time: 'the start time',
  withWhom: 'who it is with',
  placeName: "the place's name",
  placeAddress: 'the address',
  driverName: "the Driver's name",
  pickupTime: 'the pickup time',
  noteForSusan: 'the Note for Susan',
  privateNotes: 'the Private notes',
};

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

function invalid(message: string, detail?: Detail): never {
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

export function createCalendarCore({ store, clock, timeZone }: CalendarCoreOptions): CalendarCore {
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
      if (id !== undefined && id !== null) {
        if (typeof id !== 'string' || !ID.test(id))
          invalid("The Appointment's ID could not be read.");
        const already = await store.appointment(id);
        // The same add, arriving again: it has been carried out, so there is nothing left to do.
        if (already && already.added.personId === by.person.id && hasDetails(already, details))
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
        added: stamp(by, at),
        lastChanged: null,
      };
      await store.addAppointment(appointment);
      await record('added', appointment, by, at);
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
      if (hasDetails(current, details)) return current;
      const at = clock.now().toISOString();
      const appointment: Appointment = {
        ...current,
        ...details,
        startsAt: startOf(details),
        lastChanged: stamp(by, at),
      };
      await store.replaceAppointment(appointment);
      await record('changed', appointment, by, at);
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
      await record('deleted', current, by, clock.now().toISOString());
    },
  };
}
