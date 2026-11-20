// What the calendar core needs from the outside world. The backend and the sample data each supply
// their own (amplify/calendar/data-store.ts, memory.ts); tests use the in-memory ones.
//
// The ports are the store, the clock, the text sender and the Admin messenger.

import type { ActivityRecord, Appointment } from './appointment';
import type { CalendarAlert } from './alerts';
import type { Reply } from './replies';
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
  /**
   * Replaces the record of a text with `next`, only if it is still as `current` has it: the same
   * status, tries and last try, and, when `current` has an Alert, that Alert in the same state,
   * last taken up at the same moment. In one step, so that of two runs settling a sent text, or
   * taking up its Alert, only one can. Answers whether it was replaced.
   */
  changeText(next: Text, current: Text): Promise<boolean>;
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

  /** Every Reply Susan sent, in any order. */
  everyReply(): Promise<Reply[]>;
  /**
   * Keeps a new Reply, unless there is already one with its ID: in one step, so the same Reply
   * arriving twice is kept once. Answers whether this one was kept.
   */
  claimReply(reply: Reply): Promise<boolean>;
  /**
   * Replaces a Reply with `next`, only if it is still as `current` has it: the same answer, and its
   * passing on in the same state, last taken up at the same moment. In one step, as `changeText`.
   */
  changeReply(next: Reply, current: Reply): Promise<boolean>;
  /** Every calendar Alert (alerts.ts), in any order. */
  everyCalendarAlert(): Promise<CalendarAlert[]>;
  /** Keeps a new calendar Alert, unless there is already one with its ID, in one step. */
  claimCalendarAlert(alert: CalendarAlert): Promise<boolean>;
  /** Replaces a calendar Alert with `next`, only if its sending is still as `current` has it. */
  changeCalendarAlert(next: CalendarAlert, current: CalendarAlert): Promise<boolean>;
  /** When the newest Reply the person has seen arrived, or null when they have seen none. */
  repliesSeen(personId: string): Promise<string | null>;
  keepRepliesSeen(personId: string, upTo: string): Promise<void>;
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
  /**
   * The text was refused and certainly did not go: there is no point trying it again. `blocked`
   * says the sender refused it because texts to that number are blocked: its owner opted out, as
   * by replying STOP, and only they can undo it.
   */
  | { sent: false; blocked?: boolean; creditLeft?: number | null };
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
 * An email to Admins. The core writes every word of it; the messenger adds only the app's address
 * for `opens`, on a line of its own, so the reader can open what it is about.
 */
export interface AdminEmail {
  subject: string;
  /** Plain text. */
  body: string;
  /** The app's address it is about, such as '/appointments/<id>'. */
  opens: string;
}

/**
 * What became of each delivery a messenger made, by its own name for each: one email to one
 * person, or one notification to one device. A person with nothing to reach them by on that
 * channel has no delivery at all, and that is not a failure: email not set up, no address, no
 * device with notifications on, or a device whose subscription is gone.
 */
export interface Deliveries {
  sent: string[];
  /** Tried and not taken: it may go if tried again. */
  failed: string[];
  /** Refused for good, such as by an address the email service will not send to. */
  refused: string[];
}

export const NO_DELIVERIES: Deliveries = { sent: [], failed: [], refused: [] };

/**
 * How the core tells Admins anything, by app notification and by email. The core decides who is
 * told: this only knows who the Admins are and reaches them. Each send leaves out the deliveries
 * named in `skip`, which have gone already, and throws only when it cannot tell what it sent.
 */
export interface AdminMessenger {
  /** The person ID of every Admin: every account marked as an Admin's. Susan is never one. */
  admins(): Promise<string[]>;
  /**
   * Shows the notification on every device each of these people turned app notifications on for.
   * A device that reports its subscription gone is forgotten.
   */
  sendAppNotification(
    to: readonly string[],
    notification: AppNotification,
    skip?: readonly string[],
  ): Promise<Deliveries>;
  /**
   * Emails each of these people at the address they sign in with, each on their own. Only an
   * Admin's address is ever used.
   */
  sendEmail(
    to: readonly string[],
    email: AdminEmail,
    skip?: readonly string[],
  ): Promise<Deliveries>;
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
  sendEmail: async () => {
    throw new Error('This calendar only reads: it tells nobody anything.');
  },
};
