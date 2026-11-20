// The calendar subscription's feed: Susan's Appointments as a standard iCalendar file (RFC 5545),
// for Apple Calendar, Google Calendar, Outlook and the rest to show beside a person's own.
//
// It is view-only and holds as little as it can: active Appointments only, and never their Private
// notes. Times are written in UTC, worked out from Susan's date and time in her own zone, so they
// are right in a subscriber's calendar whatever zone the subscriber is in, on either side of a
// daylight-saving change, with no time-zone table for a calendar app to misread.

import { formatTime } from '../localTime';
import { inDateOrder, type Appointment } from './appointment';

/** Appointments have no end time, so each is shown as this long. */
const LENGTH_MS = 60 * 60_000;

/** The feed's name, as a calendar app lists it. */
export const FEED_NAME = "Susan's Calendar";

/** A moment as iCalendar writes one in UTC: 20261120T190000Z. */
const utc = (moment: string | number) =>
  new Date(moment).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Words as an iCalendar TEXT value: backslashes, semicolons, commas and line breaks escaped. */
const text = (words: string) =>
  words
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n?|\n/g, '\\n');

/**
 * One content line, folded so that no line is longer than 75 bytes: each further part starts on
 * its own line after a space. A character is never split across two lines.
 */
function folded(line: string): string {
  const parts: string[] = [];
  let part = '';
  let bytes = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    // The first line holds 75 bytes; each later one 74, after its leading space.
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(part);
      part = '';
      bytes = 0;
    }
    part += character;
    bytes += size;
  }
  parts.push(part);
  return parts.join('\r\n ');
}

/** Who it is with, the Driver and pickup time, and the Note for Susan: never the Private notes. */
function description(appointment: Appointment): string | null {
  const { withWhom, driverName, pickupTime, noteForSusan } = appointment;
  const lines: string[] = [];
  if (withWhom) lines.push(`With ${withWhom}`);
  if (driverName && pickupTime)
    lines.push(`Driver: ${driverName}, picking Susan up at ${formatTime(pickupTime)}`);
  else if (driverName) lines.push(`Driver: ${driverName}`);
  else if (pickupTime) lines.push(`Pickup at ${formatTime(pickupTime)}`);
  if (noteForSusan) lines.push(`Note for Susan: ${noteForSusan}`);
  return lines.length ? lines.join('\n') : null;
}

function event(appointment: Appointment): string[] {
  const { id, what, placeName, placeAddress, startsAt, added, lastChanged } = appointment;
  const where = [placeName, placeAddress].filter(Boolean).join(', ');
  const about = description(appointment);
  const changed = utc((lastChanged ?? added).at);
  return [
    'BEGIN:VEVENT',
    `UID:${id}@susans-calendar`,
    `DTSTAMP:${changed}`,
    `LAST-MODIFIED:${changed}`,
    `DTSTART:${utc(startsAt)}`,
    `DTEND:${utc(new Date(startsAt).getTime() + LENGTH_MS)}`,
    `SUMMARY:${text(what)}`,
    ...(where ? [`LOCATION:${text(where)}`] : []),
    ...(about ? [`DESCRIPTION:${text(about)}`] : []),
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
  ];
}

/** The feed for a set of Appointments: every active one, in date order, and nothing else. */
export function calendarFeed(appointments: readonly Appointment[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Susan's Calendar//Calendar subscription//EN",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `NAME:${text(FEED_NAME)}`,
    `X-WR-CALNAME:${text(FEED_NAME)}`,
    // A hint to check back hourly. Each calendar app keeps to its own schedule in the end.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...inDateOrder(appointments.filter((each) => each.state === 'active')).flatMap(event),
    'END:VCALENDAR',
  ];
  return `${lines.map(folded).join('\r\n')}\r\n`;
}
