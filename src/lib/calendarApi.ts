// The calendar as the data API carries it (amplify/data/resource.ts): what it hands over when read,
// and what a command answers with. Shared by the app, which reads the data API directly, and the
// backend.

import type { Schema } from '../../amplify/data/resource';
import type {
  Appointment,
  RefusalField,
  RefusalReason,
  Reminder,
  ReminderTiming,
  Stamp,
} from './calendar';

/**
 * What a command answers with: the Appointment as it now is (null once deleted), or the core's
 * refusal. A refusal is an answer, not an error, so that it reaches the person in the core's own
 * words; an error means the command may not have been carried out at all.
 */
export type CommandAnswer =
  | { appointment: Appointment | null }
  | { refusal: { reason: RefusalReason; message: string; detail?: RefusalField } };

/** Said when a command failed for a reason that is nobody's mistake. */
export const COMMAND_FAILED = 'Could not save the change. Check your connection and try again.';

export type AppointmentRow = Schema['Appointment']['type'];

/** A row's fields that the calendar core also names; the data API adds its own beside them. */
type Kept<Row, Value> = Pick<Row, Extract<keyof Row, keyof Value>>;

const toStamp = ({ personId, personName, viaAgent, at }: Stamp): Stamp => ({
  personId,
  personName,
  viaAgent,
  at,
});

type ReminderRow = NonNullable<NonNullable<AppointmentRow['reminders']>[number]>;

/** A Reminder as the data API carries it, or null when it is not one the calendar could have kept. */
function toReminder(row: ReminderRow | null | undefined): Reminder | null {
  if (!row?.shape) return null;
  const { id, dueAt, needsReview } = row;
  let timing: ReminderTiming;
  if (row.shape === 'before' && row.amount != null && row.unit)
    timing = { shape: 'before', amount: row.amount, unit: row.unit };
  else if (row.shape === 'daysBefore' && row.days != null && row.time)
    timing = { shape: 'daysBefore', days: row.days, time: row.time };
  else if (row.shape === 'at' && row.date && row.time)
    timing = { shape: 'at', date: row.date, time: row.time };
  else return null;
  return { id, ...timing, dueAt, needsReview };
}

export function toAppointment(row: Kept<AppointmentRow, Appointment>): Appointment {
  return {
    id: row.id,
    what: row.what,
    date: row.date,
    time: row.time,
    startsAt: row.startsAt,
    withWhom: row.withWhom ?? null,
    placeName: row.placeName ?? null,
    placeAddress: row.placeAddress ?? null,
    driverName: row.driverName ?? null,
    pickupTime: row.pickupTime ?? null,
    noteForSusan: row.noteForSusan ?? null,
    privateNotes: row.privateNotes ?? null,
    state: row.state ?? 'active',
    // An Appointment kept before Reminders existed has none.
    reminders: (row.reminders ?? []).flatMap((each) => toReminder(each) ?? []),
    added: toStamp(row.added),
    lastChanged: row.lastChanged ? toStamp(row.lastChanged) : null,
  };
}
