// What the calendar core needs from the outside world. The backend and the sample data each supply
// their own (amplify/calendar/data-store.ts, memory.ts); tests use the in-memory ones.
//
// A later ticket adds the text sender here.

import type { ActivityRecord, Appointment } from './appointment';

/** Where calendar data is kept. Only the core writes through it. */
export interface Store {
  /** The Appointment with this ID, or null when the calendar has none. */
  appointment(id: string): Promise<Appointment | null>;
  /** Keeps a new Appointment. */
  addAppointment(appointment: Appointment): Promise<void>;
  /** Replaces the Appointment that has this one's ID with this one. */
  replaceAppointment(appointment: Appointment): Promise<void>;
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

/** The real time. */
export const systemClock: Clock = { now: () => new Date() };

/**
 * An app notification: a message that shows on a device, and opens a screen of the app when
 * tapped. The core writes every word of it.
 */
export interface AppNotification {
  title: string;
  body: string;
  /** The app's address that tapping it opens, such as '/appointments/<id>'. */
  opens: string;
  /** A newer notification with the same tag takes the place of an older one on a device. */
  tag: string;
}

/**
 * How the core tells Admins anything. For now it has one channel, app notifications; ticket 15
 * adds email. The core decides who is told: this only knows who the Admins are and reaches them.
 */
export interface AdminMessenger {
  /** The person ID of every Admin: every account marked as an Admin's. Susan is never one. */
  admins(): Promise<string[]>;
  /**
   * Shows the notification on every device each of these people turned app notifications on for.
   * A device that reports its subscription gone is forgotten.
   */
  sendAppNotification(to: readonly string[], notification: AppNotification): Promise<void>;
}
