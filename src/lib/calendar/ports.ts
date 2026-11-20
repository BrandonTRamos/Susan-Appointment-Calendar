// What the calendar core needs from the outside world. The backend and the sample data each supply
// their own (amplify/calendar/data-store.ts, memory.ts); tests use the in-memory ones.
//
// Later tickets add the text sender and the Admin messenger here.

import type { ActivityRecord, Appointment } from './appointment';
import type { SubscriptionLink } from './subscription';

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
  /** Every Appointment in the calendar, active and cancelled, in any order. */
  everyAppointment(): Promise<Appointment[]>;
  /** The person's subscription link, or null when they have none. */
  subscriptionLinkOf(personId: string): Promise<SubscriptionLink | null>;
  /** The subscription link with this hash, or null when there is none. */
  subscriptionLinkByHash(hash: string): Promise<SubscriptionLink | null>;
  /** Keeps a person's subscription link in place of any they had. */
  keepSubscriptionLink(link: SubscriptionLink): Promise<void>;
  /** Removes the person's subscription link, if they have one. */
  removeSubscriptionLink(personId: string): Promise<void>;
}

/** What time it is. */
export interface Clock {
  now(): Date;
}

/** The real time. */
export const systemClock: Clock = { now: () => new Date() };
