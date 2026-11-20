import type { Appointment } from '../lib/calendar';

/**
 * The Reminders still to be sent for an Appointment, on the next-Appointment card on Upcoming.
 * The calendar holds no Reminders yet: ticket 07 (Reminders on an Appointment) fills this place.
 */
export function RemindersToSend(_: { appointment: Appointment }) {
  return null;
}
