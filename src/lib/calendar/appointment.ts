// What the calendar holds, in the words of CONTEXT.md.

/** Someone with an account: Susan or an Admin. The calendar makes no difference between them. */
export interface Person {
  /** The account's permanent ID. Never shown. */
  id: string;
  /** The name the calendar calls them by. */
  name: string;
}

/** Who is carrying out a command, and whether their agent is doing it for them. */
export interface Actor {
  person: Person;
  viaAgent: boolean;
}

/** Who did something to an Appointment, and when. */
export interface Stamp {
  personId: string;
  /** Their name at the time. */
  personName: string;
  viaAgent: boolean;
  /** The moment, as an ISO timestamp. */
  at: string;
}

/**
 * What a person enters about an Appointment. The date and both times are Susan's local time
 * (src/lib/localTime.ts). There is no end time, category or attachment.
 */
export interface AppointmentDetails {
  /** What it is: "Cardiology check-up". */
  what: string;
  /** The day it is on, 'YYYY-MM-DD'. */
  date: string;
  /** When it starts, 'HH:MM'. */
  time: string;
  /** Who it is with. */
  withWhom: string | null;
  /** Where it is: the place's name, and its address. */
  placeName: string | null;
  placeAddress: string | null;
  /** The Driver, by name, and when they pick Susan up, 'HH:MM'. */
  driverName: string | null;
  pickupTime: string | null;
  /** Included in every Reminder. */
  noteForSusan: string | null;
  /** Read in the calendar, never sent in a text. */
  privateNotes: string | null;
}

/** The details in the order a person reads them. */
export const DETAILS = [
  'what',
  'date',
  'time',
  'withWhom',
  'placeName',
  'placeAddress',
  'driverName',
  'pickupTime',
  'noteForSusan',
  'privateNotes',
] as const satisfies readonly (keyof AppointmentDetails)[];

export type Detail = (typeof DETAILS)[number];

export const REMINDER_SHAPES = ['before', 'daysBefore', 'at'] as const;
export type ReminderShape = (typeof REMINDER_SHAPES)[number];

export const REMINDER_UNITS = ['minutes', 'hours', 'days'] as const;
export type ReminderUnit = (typeof REMINDER_UNITS)[number];

/**
 * When a Reminder goes out, in one of three shapes. The first two follow the Appointment when it
 * moves; the third keeps its time. Times are Susan's local time.
 */
export type ReminderTiming =
  /** A gap before the Appointment's start: "2 hours before". */
  | { shape: 'before'; amount: number; unit: ReminderUnit }
  /** A number of days before, at a clock time: "the day before at 6:00 pm". 0 is the same day. */
  | { shape: 'daysBefore'; days: number; time: string }
  /** An exact date, 'YYYY-MM-DD', and time, 'HH:MM'. */
  | { shape: 'at'; date: string; time: string };

/** A Reminder on an Appointment: a text to Susan about it. */
export type Reminder = ReminderTiming & {
  id: string;
  /** The moment it goes out, as an ISO timestamp. The core keeps it in step with the Appointment. */
  dueAt: string;
  /**
   * An exact-time Reminder whose Appointment has moved since it was set. It keeps its time until
   * someone confirms or changes it.
   */
  needsReview: boolean;
};

/**
 * A Reminder as a person sets it. One with the ID of a Reminder the Appointment already has is that
 * Reminder, kept or changed; one without is new. `reviewed` confirms a Reminder flagged for review.
 */
export type ReminderSetting = ReminderTiming & { id?: string; reviewed?: boolean };

/**
 * What a new Appointment needs: what it is, its date and its start time. The rest can wait. With no
 * Reminders given it starts with one, the day before at 6:00 pm; an empty list means none.
 */
export type NewAppointment = Pick<AppointmentDetails, 'what' | 'date' | 'time'> &
  Partial<AppointmentDetails> & { reminders?: ReminderSetting[] };

/**
 * The details to change. One left out stays as it is; null or empty words clear one. Reminders, when
 * given, are the whole new list.
 */
export type AppointmentChanges = Partial<AppointmentDetails> & { reminders?: ReminderSetting[] };

export const APPOINTMENT_STATES = ['active', 'cancelled'] as const;
export type AppointmentState = (typeof APPOINTMENT_STATES)[number];

export interface Appointment extends AppointmentDetails {
  id: string;
  /** The moment it starts: its date and time in Susan's time zone. The core keeps it in step. */
  startsAt: string;
  /** A cancelled Appointment stays in the calendar. */
  state: AppointmentState;
  /** Its Reminders, in the order they go out. */
  reminders: Reminder[];
  added: Stamp;
  /** Null until someone changes or cancels it. */
  lastChanged: Stamp | null;
}

export const ACTIVITY_ACTIONS = ['added', 'changed', 'cancelled', 'deleted'] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/**
 * The calendar's own note of one command: who did what to which Appointment, and whether through
 * an agent. It carries what the Appointment was called and when it was, so it still reads after
 * the Appointment is deleted.
 */
export interface ActivityRecord {
  id: string;
  at: string;
  personId: string;
  personName: string;
  viaAgent: boolean;
  action: ActivityAction;
  appointmentId: string;
  what: string;
  date: string;
  time: string;
}

/** Appointments in the order they happen. */
export function inDateOrder(appointments: readonly Appointment[]): Appointment[] {
  return [...appointments].sort(
    (a, b) =>
      a.startsAt.localeCompare(b.startsAt) ||
      a.what.localeCompare(b.what) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * The Appointments still to come, in date order: everything dated `today` (Susan's date, from
 * `today` in src/lib/localTime.ts) or later and not cancelled. One that started earlier today is
 * still listed, so that nobody loses the address while she is on her way.
 */
export function upcomingAppointments(
  appointments: readonly Appointment[],
  today: string,
): Appointment[] {
  return inDateOrder(
    appointments.filter(
      (appointment) => appointment.date >= today && appointment.state === 'active',
    ),
  );
}

/**
 * The Appointments that have already happened, newest first: everything dated before `today`,
 * cancelled ones included. One from earlier today is still upcoming (see upcomingAppointments).
 */
export function pastAppointments(
  appointments: readonly Appointment[],
  today: string,
): Appointment[] {
  return inDateOrder(appointments.filter((appointment) => appointment.date < today)).reverse();
}

/** An Appointment has no end time; for overlaps, each is taken to be about this long. */
const ABOUT_AN_HOUR = 60 * 60_000;

/**
 * The other Appointments that overlap one, in date order, taking each to be about an hour long:
 * those starting less than an hour before or after it. Cancelled ones overlap nothing. Measured
 * between the moments they start, so a clock change between them counts as it really is.
 */
export function overlappingAppointments(
  appointment: Appointment,
  appointments: readonly Appointment[],
): Appointment[] {
  if (appointment.state !== 'active') return [];
  const starts = Date.parse(appointment.startsAt);
  return inDateOrder(
    appointments.filter(
      (other) =>
        other.id !== appointment.id &&
        other.state === 'active' &&
        Math.abs(Date.parse(other.startsAt) - starts) < ABOUT_AN_HOUR,
    ),
  );
}
