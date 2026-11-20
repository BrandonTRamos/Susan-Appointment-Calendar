// Series: Appointments that repeat on a regular pattern and were entered once (CONTEXT.md). Pure, so
// that the form can show which days a pattern gives while it is being picked, and the core works
// them out the same.
//
// A pattern is worked out on Susan's dates alone, 'YYYY-MM-DD', with no time and no time zone: each
// Appointment in a Series is on one of those dates at the Series' clock time, and the moment it
// starts is worked out from them in Susan's zone like any other Appointment's. So a weekly 9:00 am
// stays at 9:00 am on both sides of a clock change.
//
// The patterns follow Personal Command Center's repeat rules (src/lib/repeat.ts there), which are
// the standard calendar format's: weeks run Monday to Sunday, and a monthly date past the 28th lands
// on the month's last day when a month is shorter. Only the three patterns the calendar offers are
// built, so no repeat-rule library is needed.

import { addDays, formatDate, isDate } from '../localTime';
import type {
  AppointmentChanges,
  AppointmentDetails,
  NewAppointment,
  ReminderTiming,
  Stamp,
} from './appointment';

/** Monday is 0 and Sunday is 6, as in the standard calendar format. */
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const REPEAT_KINDS = ['week', 'month'] as const;
export type RepeatKind = (typeof REPEAT_KINDS)[number];

/**
 * How a Series repeats: every N weeks on chosen weekdays, or every N months on one day of the month.
 * Every week is a gap of 1.
 */
export type Repeat =
  /** Weekdays are 0 (Monday) to 6 (Sunday), in order. */
  | { every: 'week'; interval: number; weekdays: number[] }
  /** The day of the month the Series started on, 1 to 31. */
  | { every: 'month'; interval: number; day: number };

/**
 * A pattern as a person picks it. A monthly one is on the day of the month the Series starts on, so
 * it is not picked. With no interval, it is every week or every month.
 */
export type RepeatSetting =
  { every: 'week'; interval?: number; weekdays: number[] } | { every: 'month'; interval?: number };

/**
 * What a new Series needs: what a new Appointment needs, where the date is its first Appointment's,
 * and how it repeats. With no end it runs on. With no Reminders given, each Appointment starts with
 * the day before at 6:00 pm; an empty list means none.
 */
export type NewSeries = NewAppointment & { repeat: RepeatSetting; ends?: string | null };

/**
 * A change to a Series from one of its Appointments on. What is left out stays as the Series has
 * it; the date, when given, is where the changed Series starts.
 */
export type SeriesChanges = AppointmentChanges & { repeat?: RepeatSetting; ends?: string | null };

/** The longest gap a pattern can have: a year either way. */
export const MOST_WEEKS = 52;
export const MOST_MONTHS = 12;

/**
 * How far ahead a Series' Appointments are made: through this many days after today, or after the
 * Series starts when that is later. A Series that runs on past it is topped up every day.
 */
export const SERIES_HORIZON_DAYS = 182;

/** A Reminder on a Series: one that follows each Appointment, never an exact time. */
export type SeriesReminder = Exclude<ReminderTiming, { shape: 'at' }>;

/**
 * Appointments that repeat on a pattern and were entered once. It holds the details and Reminders
 * its Appointments start with; each one made from it is a real Appointment, which can then be
 * changed on its own.
 */
export interface Series extends Omit<AppointmentDetails, 'date'> {
  id: string;
  repeat: Repeat;
  /** The date of its first Appointment, which is always one the pattern gives. */
  starts: string;
  /** The last date it can have an Appointment on, or null when it runs with no end. */
  ends: string | null;
  /** Gap-based only, so that each applies the same to every Appointment. */
  reminders: SeriesReminder[];
  /** Its Appointments have been made for every date up to and including this one. */
  madeThrough: string;
  added: Stamp;
  /** Null until someone changes or ends it. */
  lastChanged: Stamp | null;
}

/** Where an Appointment stands in a Series. */
export interface SeriesPlace {
  /** The Series it belongs to. */
  id: string;
  /** The date the Series' pattern gave it, whatever it has been moved to since. */
  date: string;
  /** How the Series repeats, for saying so beside the Appointment. It never changes on a Series. */
  repeat: Repeat;
  /** Changed or cancelled on its own, apart from the rest of the Series. */
  individuallyChanged: boolean;
  /**
   * The Series' clock time, 'HH:MM', when the clocks skip it on this Appointment's date, the night
   * they go forward: the Appointment then starts that much later, moved on by the jump (2:30 am
   * becomes 3:30 am where they jump an hour), and this says so. Null on every other date, and once
   * someone changes this Appointment's date or time.
   */
  shiftedFrom: string | null;
}

/** The parts of a date, read as if it were UTC: for arithmetic on the calendar alone. */
function parts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const dateOf = (year: number, month: number, day: number) =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** A date's weekday: 0 for Monday to 6 for Sunday. */
export function weekdayOf(date: string): number {
  const { year, month, day } = parts(date);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** The Monday of the week a date is in. */
const mondayOf = (date: string) => addDays(date, -weekdayOf(date));

/**
 * The dates a pattern gives from its first date, `starts`, up to and including `through` and never
 * past `ends`, in order. Only those after `after` are given, when it is set.
 */
export function repeatDates(
  repeat: Repeat,
  starts: string,
  ends: string | null,
  through: string,
  after?: string,
): string[] {
  const last = ends && ends < through ? ends : through;
  const dates: string[] = [];
  const keep = (date: string) => {
    if (date >= starts && date <= last && (!after || date > after)) dates.push(date);
  };
  if (repeat.every === 'week') {
    const weekdays = [...new Set(repeat.weekdays)].sort((a, b) => a - b);
    // Weeks are counted from the one the Series starts in, so every N weeks keeps to the same ones.
    for (
      let monday = mondayOf(starts);
      monday <= last;
      monday = addDays(monday, 7 * repeat.interval)
    )
      for (const weekday of weekdays) keep(addDays(monday, weekday));
  } else {
    const first = parts(starts);
    for (let n = 0; ; n += repeat.interval) {
      const month0 = first.month - 1 + n;
      const year = first.year + Math.floor(month0 / 12);
      const month = (month0 % 12) + 1;
      const date = dateOf(year, month, Math.min(repeat.day, daysInMonth(year, month)));
      if (date > last) break;
      keep(date);
    }
  }
  return dates;
}

/**
 * Whether a pattern can give this date: one of its weekdays, or its day of the month, which is the
 * last day in a shorter month.
 */
export function repeatGives(repeat: Repeat, date: string): boolean {
  if (!isDate(date)) return false;
  if (repeat.every === 'week') return repeat.weekdays.includes(weekdayOf(date));
  const { year, month, day } = parts(date);
  return day === Math.min(repeat.day, daysInMonth(year, month));
}

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as const)[n % 10] ?? 'th');
  return `${n}${suffix}`;
};

/** "a", "a and b", "a, b and c". */
const listed = (words: string[]) =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/**
 * A pattern in words: "Every week on Monday and Thursday", "Every 2 weeks on Tuesday", "Every month
 * on the 15th", "Every 3 months on the 31st, or the last day of a shorter month".
 */
export function describeRepeat(repeat: Repeat): string {
  if (repeat.every === 'week') {
    const every = repeat.interval === 1 ? 'Every week' : `Every ${repeat.interval} weeks`;
    const weekdays = [...new Set(repeat.weekdays)].sort((a, b) => a - b);
    const names = weekdays.map((weekday) => WEEKDAY_NAMES[weekday]).filter(Boolean);
    return names.length ? `${every} on ${listed(names)}` : every;
  }
  const every = repeat.interval === 1 ? 'Every month' : `Every ${repeat.interval} months`;
  const shorter = repeat.day > 28 ? ', or the last day of a shorter month' : '';
  return `${every} on the ${ordinal(repeat.day)}${shorter}`;
}

/** A Series' pattern and end in words: "Every week on Monday, until Friday, January 29, 2027". */
export function describeSeries({ repeat, ends }: Pick<Series, 'repeat' | 'ends'>): string {
  return ends ? `${describeRepeat(repeat)}, until ${formatDate(ends)}` : describeRepeat(repeat);
}
