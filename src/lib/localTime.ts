// Susan's local time. A date is 'YYYY-MM-DD' and a time is 'HH:MM' on a 24-hour clock, both as the
// calendar and clock on her wall show them. A moment is a point in time, the same everywhere.
// Nothing here reads the machine's time zone: the zone is always passed in, from resolveTimeZone
// (src/lib/timeZone.ts). Shared by the app and the backend.

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A date and a time as Susan's wall calendar and clock show them. */
export interface LocalDateTime {
  date: string;
  time: string;
}

/** Whether the words are a real calendar date, written 'YYYY-MM-DD'. */
export function isDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

/** Whether the words are a time of day, written 'HH:MM' on a 24-hour clock. */
export function isTime(value: string): boolean {
  const match = TIME.exec(value);
  return Boolean(match) && Number(match![1]) < 24 && Number(match![2]) < 60;
}

/** A date and time read as if they were UTC: for arithmetic on the calendar, never for display. */
function asIfUtc(date: string, time: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute);
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** The date and time a moment falls on in a zone, to the minute. */
export function localDateTime(moment: Date, zone: string): LocalDateTime {
  let format = formats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formats.set(zone, format);
  }
  const part: Record<string, string> = {};
  for (const { type, value } of format.formatToParts(moment)) part[type] = value;
  return {
    date: `${part.year.padStart(4, '0')}-${part.month}-${part.day}`,
    time: `${part.hour}:${part.minute}`,
  };
}

/** Today's date in a zone. */
export function today(zone: string, now: Date): string {
  return localDateTime(now, zone).date;
}

/** The date a number of days after a date, or before it when the number is negative. */
export function addDays(date: string, days: number): string {
  return new Date(asIfUtc(date, '00:00') + days * DAY).toISOString().slice(0, 10);
}

/**
 * The moment a date and time happen in a zone.
 *
 * Null when that time does not exist there: the hour the clocks skip when they go forward. A time
 * that happens twice, in the hour the clocks repeat when they go back, means the first of the two.
 */
export function momentOf(date: string, time: string, zone: string): Date | null {
  const wall = asIfUtc(date, time);
  // The zone's distance from UTC a day either side: the two it can have around a clock change.
  const candidates = [wall - DAY, wall + DAY]
    .map((probe) => {
      const local = localDateTime(new Date(probe), zone);
      return wall - (asIfUtc(local.date, local.time) - probe);
    })
    .sort((a, b) => a - b);
  for (const candidate of candidates) {
    const local = localDateTime(new Date(candidate), zone);
    if (local.date === date && local.time === time) return new Date(candidate);
  }
  return null;
}

/**
 * The moment a date and time happen in a zone, reading a time the clocks skip as the same time an
 * hour later, when they have landed. For times worked out by the calendar rather than typed by a
 * person, which have to happen at some moment.
 */
export function momentOrSkipped(date: string, time: string, zone: string): Date {
  const moment = momentOf(date, time, zone);
  if (moment) return moment;
  const later = localDateTime(new Date(asIfUtc(date, time) + 60 * MINUTE), 'UTC');
  return momentOf(later.date, later.time, zone) ?? new Date(asIfUtc(date, time));
}

const weekdayAndDate = (style: 'long' | 'short') =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: style,
    month: style,
    day: 'numeric',
    year: 'numeric',
  });
const DATE_FORMATS = {
  long: weekdayAndDate('long'),
  short: weekdayAndDate('short'),
  noYear: new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }),
};

/**
 * A date in words: "Friday, November 20, 2026", "Fri, Nov 20, 2026" when short, or "Friday,
 * November 20" with no year.
 */
export function formatDate(date: string, style: keyof typeof DATE_FORMATS = 'long'): string {
  return DATE_FORMATS[style].format(new Date(asIfUtc(date, '00:00')));
}

const BRIEF = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/**
 * A day as a person says it, from `today`: "Today · Thu, Nov 19", "Tomorrow · Fri, Nov 20", or
 * just "Mon, Nov 23" further ahead. The year is added when it is not today's year.
 */
export function dayInWords(date: string, today: string): string {
  const day =
    date.slice(0, 4) === today.slice(0, 4)
      ? BRIEF.format(new Date(asIfUtc(date, '00:00')))
      : formatDate(date, 'short');
  const word = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : null;
  return word ? `${word} · ${day}` : day;
}

/** A date's weekday, month and day of the month, in short words: Tue, Dec, 1. */
export function dateParts(date: string): { weekday: string; month: string; day: string } {
  const part: Record<string, string> = {};
  for (const { type, value } of BRIEF.formatToParts(new Date(asIfUtc(date, '00:00'))))
    part[type] = value;
  return { weekday: part.weekday, month: part.month, day: part.day };
}

/** A time as a person says it: "2:30 pm". */
export function formatTime(time: string): string {
  const [hour, minute] = time.split(':');
  return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? 'am' : 'pm'}`;
}

/** A moment in a zone's local time: "Thu, Nov 19, 2026 at 3:15 pm". */
export function formatMoment(moment: string | Date, zone: string): string {
  const local = localDateTime(new Date(moment), zone);
  return `${formatDate(local.date, 'short')} at ${formatTime(local.time)}`;
}
