// Reminders: when each goes out, and the words Susan reads. Pure, so that the form can show what a
// Reminder will do while it is being typed, and the core and the scheduled run work it out the same.

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
import { reminderPlan } from './texts';
import type {
  Appointment,
  AppointmentDetails,
  Reminder,
  ReminderTiming,
  ReminderUnit,
} from './appointment';

/** The Reminder a new Appointment starts with: the day before at 6:00 pm. */
export const STARTING_REMINDER: ReminderTiming = { shape: 'daysBefore', days: 1, time: '18:00' };

const MINUTE = 60_000;
const UNIT_LENGTH: Record<Exclude<ReminderUnit, 'days'>, number> = {
  minutes: MINUTE,
  hours: 60 * MINUTE,
};

/**
 * The moment a Reminder with this timing goes out, for an Appointment on this date and at this
 * time. Gaps are measured from the start, not the pickup time; a gap in days keeps the clock time,
 * whatever the clocks do in between. Null when the timing or the start does not make a moment: an
 * exact time the clocks skip, or something that is not a date or time.
 */
export function reminderDue(
  timing: ReminderTiming,
  start: Pick<AppointmentDetails, 'date' | 'time'>,
  timeZone: string,
): Date | null {
  const whole = (n: unknown, least: number) => Number.isInteger(n) && (n as number) >= least;
  if (timing.shape === 'at')
    return isDate(timing.date) && isTime(timing.time)
      ? momentOf(timing.date, timing.time, timeZone)
      : null;
  if (!isDate(start.date) || !isTime(start.time)) return null;
  if (timing.shape === 'daysBefore')
    return whole(timing.days, 0) && isTime(timing.time)
      ? momentOrSkipped(addDays(start.date, -timing.days), timing.time, timeZone)
      : null;
  if (!whole(timing.amount, 1)) return null;
  if (timing.unit === 'days')
    return momentOrSkipped(addDays(start.date, -timing.amount), start.time, timeZone);
  const startsAt = momentOf(start.date, start.time, timeZone);
  const length = UNIT_LENGTH[timing.unit];
  return startsAt && length ? new Date(startsAt.getTime() - timing.amount * length) : null;
}

/** Whether a moment falls between 9:00 pm and 7:00 am in Susan's time zone. */
export function isOvernight(moment: string | Date, timeZone: string): boolean {
  const { time } = localDateTime(new Date(moment), timeZone);
  return time >= '21:00' || time < '07:00';
}

/** A Reminder's timing in words: "2 hours before", "The day before at 6:00 pm". */
export function describeReminder(timing: ReminderTiming): string {
  const count = (n: number, unit: string) => `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`;
  switch (timing.shape) {
    case 'before':
      return `${count(timing.amount, timing.unit)} before`;
    case 'daysBefore': {
      const at = isTime(timing.time) ? ` at ${formatTime(timing.time)}` : '';
      if (timing.days === 0) return `The same day${at}`;
      if (timing.days === 1) return `The day before${at}`;
      return `${count(timing.days, 'days')} before${at}`;
    }
    case 'at':
      return isDate(timing.date) && isTime(timing.time)
        ? `On ${formatDate(timing.date, 'short')} at ${formatTime(timing.time)}`
        : 'At a set time';
  }
}

/**
 * The Reminders still to be sent: those whose time has not yet come, in the order they go out, as
 * reminderPlan (texts.ts) has them. A cancelled Appointment has none, and a Reminder held for review
 * since its Appointment moved is not one: it goes out only once someone keeps or changes it.
 */
export function remindersStillToSend(appointment: Appointment, now: Date): Reminder[] {
  return appointment.reminders.filter(
    (reminder) => reminderPlan(appointment, reminder, now) === 'later',
  );
}

/** Words as they are typed or kept, as one line with no stray spaces, or null for none. */
function line(words: string | null | undefined): string | null {
  return words?.replace(/\s+/g, ' ').trim() || null;
}

/** Ends a sentence with a full stop, unless it already ends like one. */
const sentence = (words: string) => (/[.!?\u2026]$/.test(words) ? words : `${words}.`);

/** "today", "tomorrow" or "Friday, November 20": the Appointment's day as seen from a moment. */
function dayInWords(date: string, from: Date, timeZone: string): string {
  const day = localDateTime(from, timeZone).date;
  if (date === day) return 'today';
  if (date === addDays(day, 1)) return 'tomorrow';
  return formatDate(date, 'noYear');
}

/**
 * The words of a Reminder, as Susan reads them when it goes out at `dueAt`: the opening "Susan's
 * Calendar:", what it is, who with, the day in words and the time, where, the Driver and pickup
 * time when there are any, then the Note for Susan. Never the Private notes.
 */
export function reminderWords(
  appointment: Omit<AppointmentDetails, 'privateNotes'>,
  { dueAt }: { dueAt: string | Date },
  timeZone: string,
): string {
  const what = line(appointment.what) ?? 'Appointment';
  const withWhom = line(appointment.withWhom);
  const where = [line(appointment.placeName), line(appointment.placeAddress)]
    .filter(Boolean)
    .join(', ');
  const driver = line(appointment.driverName);
  const pickup = isTime(appointment.pickupTime ?? '') ? formatTime(appointment.pickupTime!) : null;
  const note = appointment.noteForSusan?.trim();

  let first = withWhom ? `${what} with ${withWhom}` : what;
  first += `, ${dayInWords(appointment.date, new Date(dueAt), timeZone)}`;
  if (isTime(appointment.time)) first += ` at ${formatTime(appointment.time)}`;
  if (where) first += `, at ${where}`;
  const parts = [`Susan's Calendar: ${sentence(first)}`];
  if (driver && pickup) parts.push(`${driver} picks you up at ${pickup}.`);
  else if (driver) parts.push(`${driver} is driving you.`);
  else if (pickup) parts.push(`Pickup is at ${pickup}.`);
  if (note) parts.push(sentence(note));
  return basicCharacters(parts.join(' '));
}

/** The characters a text message can carry without falling back to a costlier encoding. */
const BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€';
const BASIC_SET = new Set(BASIC);

/** Common characters outside that set, and what to write instead. */
const STAND_INS: [RegExp, string][] = [
  [/[\u2018\u2019\u201a\u201b\u2032\u02bc]/g, "'"],
  [/[\u201c\u201d\u201e\u201f\u2033]/g, '"'],
  [/[\u2010-\u2015\u2212]/g, '-'],
  [/\u2026/g, '...'],
  [/\u2022/g, '-'],
  [/[\t\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' '],
];

/**
 * Keeps words to the basic text-message characters where it can: straight quotes for curly ones, a
 * hyphen for a dash, a plain letter for an accented one the basic set lacks. A character with no
 * stand-in is kept as it is.
 */
export function basicCharacters(words: string): string {
  let plain = words;
  for (const [pattern, standIn] of STAND_INS) plain = plain.replace(pattern, standIn);
  return [...plain]
    .map((character) => {
      if (BASIC_SET.has(character)) return character;
      const bare = character.normalize('NFD').replace(/\p{M}/gu, '');
      return bare && [...bare].every((c) => BASIC_SET.has(c)) ? bare : character;
    })
    .join('');
}
