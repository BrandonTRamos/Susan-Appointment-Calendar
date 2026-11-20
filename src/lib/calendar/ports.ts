// What the calendar core needs from the outside world. The backend and the sample data each supply
// their own (amplify/calendar/data-store.ts, memory.ts); tests use the in-memory ones.
//
// Later tickets add the text sender and the Admin messenger here.

import type { ActivityRecord, Appointment } from './appointment';

/** Where calendar data is kept. Only the core writes through it. */
export interface Store {
  /** The Appointment with this ID, or null when the calendar has none. */
  appointment(id: string): Promise<Appointment | null>;
  /** Adds the Appointment, or replaces the one with its ID. */
  saveAppointment(appointment: Appointment): Promise<void>;
  /** Removes the Appointment for good. */
  removeAppointment(id: string): Promise<void>;
  /** Whether any text about the Appointment has gone to Susan. */
  textSentAbout(appointmentId: string): Promise<boolean>;
  recordActivity(record: ActivityRecord): Promise<void>;
}

/** What time it is. */
export interface Clock {
  now(): Date;
}
