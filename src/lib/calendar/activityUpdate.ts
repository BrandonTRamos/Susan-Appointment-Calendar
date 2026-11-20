// The words of an Activity update: the app notification that tells the other Admins someone added,
// changed or cancelled an Appointment. It names who did it, the Appointment and when it is, and,
// for a change, which details changed. It gives no detail's new words beyond what it is and when,
// because it shows on a locked phone.

import { formatDate, formatTime } from '../localTime';
import { DETAIL_NAMES, DETAILS, type Actor, type Appointment, type Detail } from './appointment';
import type { AppNotification } from './ports';

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

export function activityUpdate(update: ActivityUpdate): AppNotification {
  const { action, by, appointment } = update;
  const who = by.viaAgent ? `${by.person.name}'s agent` : by.person.name;
  const about = `${who} ${action} ${appointment.what}, ${when(appointment)}`;
  let body = `${about}.`;
  if (update.action === 'changed') {
    const { before } = update;
    const details = DETAILS.filter((detail) => appointment[detail] !== before[detail]);
    body = `${about}: ${listed(details.map((detail) => changed(detail, before)))}.`;
  }
  return {
    title: "Susan's Calendar",
    body,
    opens: `/appointments/${appointment.id}`,
    tag: `appointment-${appointment.id}`,
  };
}
