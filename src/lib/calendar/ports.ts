// What the calendar core needs from the outside world. The backend and the sample data each supply
// their own (amplify/calendar/data-store.ts, memory.ts); tests use the in-memory ones.
//
// The ports are the store, the clock, the text sender and the Admin messenger.

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
  /**
   * Replaces the record of a text with `next`, only if it is still waiting with the tries and last
   * try `current` has: in one step, so that of two runs taking up the same waiting text only one
   * can. Answers whether it was replaced.
   */
  retakeText(next: Text, current: Text): Promise<boolean>;
  /** Replaces the record of a text that this run holds, by its claim or retake, with this one. */
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
  /**
   * The text was taken for sending. `reference` is the sender's own name for it, for asking later
   * what became of it; null when it gives none, and then nobody can be asked.
   */
  | { sent: true; reference: string | null; creditLeft?: number | null }
  /** The text was refused and certainly did not go: there is no point trying it again. */
  | { sent: false; creditLeft?: number | null };
// `creditLeft` on either is the credit left for texts afterwards, when the sender says.

export const DELIVERY_REPORTS = ['delivered', 'failed', 'pending'] as const;
/**
 * What the text sender says became of a text it took. Delivered: the carrier accepted it for her
 * phone, which is not to say she read it. Failed: it was not delivered. Pending: no word yet, or
 * none that settles it; asked again on the next run.
 */
export type DeliveryReport = (typeof DELIVERY_REPORTS)[number];

/**
 * How texts reach Susan's phone. The single seam ADR 0002 keeps: Textbelt sits behind it
 * (amplify/calendar/textbelt.ts), and the stand-in in memory.ts wherever Textbelt's key is absent.
 * Nothing outside the sender knows which provider it is or what its answers look like.
 */
export interface TextSender {
  /**
   * Sends the words to the number. Throws when it cannot tell whether the text went, as when the
   * connection drops; the core then tries again, preferring a rare duplicate to a missed Reminder.
   * Never puts the number or the words in an error or a log.
   */
  send(text: { to: string; words: string }): Promise<SendResult>;
  /**
   * What became of the text it named `reference` when it took it. Throws when it cannot find out
   * just now; the core asks again on the next run.
   */
  delivery(reference: string): Promise<DeliveryReport>;
}

/** The sender for a core that only reads, such as the subscription feed's: it sends nothing. */
export const NO_TEXT_SENDER: TextSender = {
  send: async () => {
    throw new Error('This calendar only reads: it sends no texts.');
  },
  delivery: async () => {
    throw new Error('This calendar only reads: it sends no texts.');
  },
};

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

/**
 * The messenger for a core that only reads, such as the subscription feed's: it knows no Admins,
 * so nothing is ever sent through it.
 */
export const NO_ADMIN_MESSENGER: AdminMessenger = {
  admins: async () => [],
  sendAppNotification: async () => {
    throw new Error('This calendar only reads: it tells nobody anything.');
  },
};
