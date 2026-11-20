// What the calendar core needs from the outside world. The backend and the sample data each supply
// their own (amplify/calendar/data-store.ts, memory.ts); tests use the in-memory ones.
//
// A later ticket adds the Admin messenger here.

import type { ActivityRecord, Appointment } from './appointment';
import type { SubscriptionLink } from './subscription';
import type { CalendarSettings, Text } from './texts';

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
  /** The record of every text about the Appointment, in any order. */
  textsAbout(appointmentId: string): Promise<Text[]>;
  /** The record of every text, in any order. */
  everyText(): Promise<Text[]>;
  /**
   * Keeps the record of a new text, unless there is already one with its ID: in one step, so that
   * of two runs claiming the same text only one can. Answers whether this one was kept.
   */
  claimText(text: Text): Promise<boolean>;
  /** Replaces the record of a text with this one. */
  replaceText(text: Text): Promise<void>;
  /** Where texts go, and who Susan is told to call; NO_SETTINGS until someone sets them. */
  settings(): Promise<CalendarSettings>;
  keepSettings(settings: CalendarSettings): Promise<void>;
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

/** What became of a send that certainly did or did not go through. */
export type SendResult =
  /** The text was taken for sending. `reference` is the sender's own name for it, if it has one. */
  | { sent: true; reference: string | null }
  /** The text was refused and certainly did not go: there is no point trying it again. */
  | { sent: false };

/**
 * How texts reach Susan's phone. The single seam ADR 0002 keeps: Textbelt sits behind it from ticket
 * 13, and the stand-in in memory.ts until then and wherever Textbelt's key is absent.
 */
export interface TextSender {
  /**
   * Sends the words to the number. Throws when it cannot tell whether the text went, as when the
   * connection drops; the core then tries again, preferring a rare duplicate to a missed Reminder.
   * Never puts the number or the words in an error or a log.
   */
  send(text: { to: string; words: string }): Promise<SendResult>;
}

/** The sender for a core that only reads, such as the subscription feed's: it sends nothing. */
export const NO_TEXT_SENDER: TextSender = {
  send: async () => {
    throw new Error('This calendar only reads: it sends no texts.');
  },
};
