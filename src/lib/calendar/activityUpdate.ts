// The words of an Activity update: the app notification that tells the other Admins someone added,
// changed or cancelled an Appointment, or a Series from one of its Appointments on. It names who did it, the Appointment and when it is, and,
// for a change, which details changed and whether the Reminders did. It gives no detail's new
// words beyond what it is and when, because it shows on a locked phone.

import { formatDate, formatTime } from '../localTime';
import {
  DETAIL_NAMES,
  DETAILS,
  type Actor,
  type Appointment,
  type Detail,
  type Reminder,
} from './appointment';
import type { AppNotification } from './ports';
import { describeRepeat, type Series } from './series';

export type ActivityUpdate =
  | { action: 'added' | 'cancelled'; by: Actor; appointment: Appointment }
  | { action: 'changed'; by: Actor; appointment: Appointment; before: Appointment };

const when = ({ date, time }: Pick<Appointment, 'date' | 'time'>) =>
  `${formatDate(date, 'short')} at ${formatTime(time)}`;

/** "a", "a and b", "a, b and c". */
const listed = (words: string[]) =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/** A changed detail by name, with what it was for the ones that say which Appointment it is. */
function changed(detail: Detail, before: Appointment): string {
  const name = DETAIL_NAMES[detail];
  if (detail === 'what') return `${name} (was ${before.what})`;
  if (detail === 'date') return `${name} (was ${formatDate(before.date, 'short')})`;
  if (detail === 'time') return `${name} (was ${formatTime(before.time)})`;
  return name;
}

/** A Reminder as a person sets it: which one, and when it goes out. Not when that works out to. */
const setting = (reminder: Reminder) =>
  JSON.stringify(
    Object.entries(reminder)
      .filter(([field, value]) => field !== 'dueAt' && field !== 'needsReview' && value != null)
      // Read back from the data API, the same Reminder may hold its fields in another order.
      .sort(([a], [b]) => a.localeCompare(b)),
  );

/**
 * Whether a person changed the Reminders: added, removed or retimed one, or confirmed one flagged
 * for review. Moving the Appointment works them out again and flags exact-time ones, but that
 * follows from the move and is told as the move.
 */
function remindersChanged(before: readonly Reminder[], after: readonly Reminder[]): boolean {
  const was = before.map(setting).sort().join('\n');
  const now = after.map(setting).sort().join('\n');
  const confirmed = after.some(
    (reminder) =>
      !reminder.needsReview && before.some((old) => old.id === reminder.id && old.needsReview),
  );
  return was !== now || confirmed;
}

export function activityUpdate(update: ActivityUpdate): AppNotification {
  const { action, by, appointment } = update;
  const who = by.viaAgent ? `${by.person.name}'s agent` : by.person.name;
  const about = `${who} ${action} ${appointment.what}, ${when(appointment)}`;
  let body = `${about}.`;
  if (update.action === 'changed') {
    const { before } = update;
    const details = DETAILS.filter((detail) => appointment[detail] !== before[detail]);
    const words = details.map((detail) => changed(detail, before));
    if (remindersChanged(before.reminders, appointment.reminders)) words.push('the Reminders');
    if (words.length) body = `${about}: ${listed(words)}.`;
  }
  return {
    title: "Susan's Calendar",
    body,
    opens: `/appointments/${appointment.id}`,
    tag: `appointment-${appointment.id}`,
  };
}

/**
 * Someone added a Series, changed it from one Appointment on, or cancelled it from one on: `from`
 * is its first Appointment, or the one it was changed or cancelled from. One update tells of the
 * whole Series, never one per Appointment in it.
 */
export interface SeriesActivityUpdate {
  action: 'added' | 'changed' | 'cancelled';
  by: Actor;
  series: Series;
  from: Appointment;
}

/** A Series' pattern, time and end, in words that follow "every": "week on Monday at 9:00 am". */
function howItRepeats(series: Series): string {
  const pattern = describeRepeat(series.repeat).replace(/^Every /, 'every ');
  const until = series.ends ? `, until ${formatDate(series.ends, 'short')}` : '';
  return `${pattern} at ${formatTime(series.time)}${until}`;
}

export function seriesActivityUpdate({
  action,
  by,
  series,
  from,
}: SeriesActivityUpdate): AppNotification {
  const who = by.viaAgent ? `${by.person.name}'s agent` : by.person.name;
  const day = formatDate(from.date, 'short');
  const body =
    action === 'added'
      ? `${who} added a Series: ${series.what}, ${howItRepeats(series)}, from ${day}.`
      : action === 'changed'
        ? `${who} changed ${series.what} from ${day} on: now ${howItRepeats(series)}.`
        : `${who} cancelled ${from.what} from ${day} on: this and all later ones.`;
  return {
    title: "Susan's Calendar",
    body,
    opens: `/appointments/${from.id}`,
    tag: `series-${series.id}`,
  };
}
