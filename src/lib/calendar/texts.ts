// Texts to Susan: the record kept of each one, when a Reminder is to be sent, and the settings that
// say where texts go. Pure, so that the scheduled run, the commands and the screens all decide the
// same way.

import type { Appointment, Reminder, Stamp } from './appointment';

export const TEXT_KINDS = ['reminder', 'changeNotice', 'automaticAnswer', 'test'] as const;
/** What a text is: a Reminder, a Change notice, the automatic answer to a Reply, or a test text. */
export type TextKind = (typeof TEXT_KINDS)[number];

export const TEXT_STATUSES = ['waiting', 'sent', 'delivered', 'failed', 'notSent'] as const;
/**
 * Where a text has got to. Waiting: due, and being sent or to be tried again. Sent: the text sender
 * took it, and no word has come yet of what became of it. Delivered: the carrier accepted it for
 * her phone; it does not mean she read it. Failed: it was refused, sending kept failing, the sender
 * reported it was not delivered, or no confirmation came in time. Not sent: the calendar chose not
 * to send it, for a reason it records.
 */
export type TextStatus = (typeof TEXT_STATUSES)[number];

export const TEXT_REASONS = [
  'noNumber',
  'tooLate',
  'cancelled',
  'outdated',
  'refused',
  'gaveUp',
  'undelivered',
  'unconfirmed',
  'webAddress',
  'blocked',
  'numberChanged',
] as const;
/**
 * Why a text failed or was not sent. noNumber: Susan's mobile number is not set. tooLate: the
 * Appointment had started. cancelled: the Appointment was cancelled while the text waited.
 * outdated: its Reminder was removed, or its time changed, while it waited to be tried again.
 * refused: the text sender would not take it. gaveUp: sending failed every time it was tried.
 * undelivered: the text sender reported that it was not delivered. unconfirmed: no confirmation
 * that it was delivered came within UNCONFIRMED_AFTER of its sending ("not confirmed delivered").
 * webAddress: its words held a web address, which no text may (holdsWebAddress). blocked: the
 * text sender refused it because texts to her number are blocked: she has opted out, as by replying
 * STOP, and only she can undo it. numberChanged: it was an automatic answer, and Susan's mobile
 * number changed in Settings before it went, so it is not sent to the new one.
 */
export type TextReason = (typeof TEXT_REASONS)[number];

/** The calendar's record of one text to Susan. */
export interface Text {
  /** Made from what the text is about and when it was due, so the same text has the same ID. */
  id: string;
  kind: TextKind;
  /** The Appointment it is about; null for a test text. */
  appointmentId: string | null;
  /** The Reminder it is, for a Reminder. */
  reminderId: string | null;
  /** The Reply it answers, for an automatic answer. */
  replyId: string | null;
  /** Its exact words. */
  words: string;
  /** When it was due, as an ISO timestamp. */
  dueAt: string;
  status: TextStatus;
  /** Why it failed or was not sent; null otherwise. */
  reason: TextReason | null;
  /** How many times sending has been tried. */
  attempts: number;
  /** When sending was last tried, or when it was recorded as not sent. */
  triedAt: string;
  /** When the text sender took it. */
  sentAt: string | null;
  /**
   * The text sender's own name for it, for asking later what became of it. Null when the sender
   * gave none, as the stand-in does: then nobody can be asked, and it stays sent.
   */
  reference: string | null;
  /**
   * The credit left for texts just after this one was sent or refused, as the text sender said
   * (Textbelt's is prepaid). Null when it did not say. The newest is the balance.
   */
  creditLeft: number | null;
  /**
   * The Alert about it (alerts.ts), once it failed or could not be sent; null for a text that needs
   * none, and for one recorded before the calendar raised Alerts.
   */
  alert: TextAlert | null;
}

export const ALERT_STATES = ['due', 'sending', 'raised'] as const;
/**
 * Where the Alert about a text has got to. Due: to be sent, or sent in part and to be tried again.
 * Sending: a run holds it and is sending it now. Raised: every delivery went, or was given up.
 */
export type AlertState = (typeof ALERT_STATES)[number];

/**
 * How far a message to every Admin has got: the Alert about a text, a calendar Alert (alerts.ts),
 * or a Reply passed on (replies.ts). It goes to each Admin by each channel; each of those
 * deliveries is named by the Admin messenger, and one known to have gone is never sent again.
 */
export interface MessageProgress {
  state: AlertState;
  /** How many times a run has taken it up to send. */
  tries: number;
  /** When a run last took it up; null until one has. */
  triedAt: string | null;
  /** Each delivery known to have gone, as the messenger names it, such as 'email:<person ID>'. */
  sent: string[];
  /** Each delivery refused for good, such as by an address SES will not send to: never retried. */
  refused: string[];
}

/** The one Alert about a text, and how far it has got. */
export type TextAlert = MessageProgress;

/** How many times a run takes up an Alert whose deliveries keep failing, before giving them up. */
export const ALERT_ATTEMPTS = 3;

/** Where texts go, and who Susan is told to call. Changed only through the calendar core. */
export interface CalendarSettings {
  /** Susan's mobile number, '+1' and ten digits. Nothing is sent while it is not set. */
  susansNumber: string | null;
  /** Who the automatic answer to a Reply tells her to call, and their number. */
  contactName: string | null;
  contactPhone: string | null;
  /**
   * How many times Susan's mobile number has been set, changed or cleared: it moves on with each
   * change of the number, and with nothing else. A Reply keeps the revision it came in under, so an
   * automatic answer never goes to a number that has replaced the one the Reply came from, without
   * a second copy of any number being kept.
   */
  numberRevision: number;
  /** Null until someone changes them. */
  lastChanged: Stamp | null;
}

export const NO_SETTINGS: CalendarSettings = {
  susansNumber: null,
  contactName: null,
  contactPhone: null,
  numberRevision: 0,
  lastChanged: null,
};

/** The words of a test text. */
export const TEST_TEXT_WORDS =
  "Susan's Calendar: This is a test text, to check that texts reach you. Nothing needs doing.";

/** How many times a text is tried before it counts as failed. */
export const SEND_ATTEMPTS = 3;
/**
 * How long a text that is waiting is left before it is tried again: longer than any run of the
 * scheduled run or a command can last, so a text being sent is never taken for one left behind.
 */
export const RETRY_AFTER = 2 * 60_000;

/**
 * How long after it was sent a text that no word has confirmed delivered is marked failed as "not
 * confirmed delivered", unless the deploy sets another (resolveConfirmationMinutes). A starting
 * guess (spec, "Further Notes"): a carrier that never confirms would make every text fail.
 */
export const UNCONFIRMED_AFTER_MINUTES = 30;
export const UNCONFIRMED_AFTER = UNCONFIRMED_AFTER_MINUTES * 60_000;

/**
 * How many texts the scheduled run asks the text sender about at once. Each question waits for its
 * own answer, so one slow answer holds up only its own text, while the run still ends well within
 * its minute. Sending is never done this way: texts go one at a time.
 */
export const STATUS_READS_AT_ONCE = 4;

/**
 * The period before a text counts as not confirmed delivered, in minutes, from the deploy's
 * TEXT_CONFIRMATION_MINUTES: UNCONFIRMED_AFTER_MINUTES when it is not set. Anything but a whole
 * number of minutes up to a week, which is as long as Textbelt keeps a status, fails the deploy.
 */
export function resolveConfirmationMinutes(configured: string | undefined | null): number {
  const typed = configured?.trim();
  if (!typed) return UNCONFIRMED_AFTER_MINUTES;
  const minutes = /^\d+$/.test(typed) ? Number(typed) : NaN;
  if (!(minutes >= 1 && minutes <= 7 * 24 * 60))
    throw new Error(
      'TEXT_CONFIRMATION_MINUTES must be a whole number of minutes, from 1 to 10080.',
    );
  return minutes;
}

/** The ID of the text a Reminder sends at the time it is now due. */
export function reminderTextId(appointment: Pick<Appointment, 'id'>, reminder: Reminder): string {
  return `reminder:${appointment.id}:${reminder.id}:${reminder.dueAt}`;
}

/** The ID of a test text asked for at a moment. */
export const testTextId = (at: string) => `test:${at}`;

/**
 * What becomes of a Reminder, as things stand at `now`, before any text for it is recorded:
 *
 * - awaitingReview: it is an exact-time Reminder flagged for review since its Appointment moved,
 *   and its time has not come. It goes out only once someone keeps or changes its time.
 * - heldForReview: its time came while it was still flagged for review, so it was not sent.
 * - later: its time has not come.
 * - send: it is due, or overdue while the Appointment has not started.
 * - tooLate: its time came and went and the Appointment has now started: recorded as not sent.
 * - pastWhenSet: its time had already passed when it was set, so it is never sent.
 * - beforeTexts: it was set before the calendar kept when each Reminder's time was set, and its
 *   Appointment has started; nothing was going to send it then, so it is let go unrecorded.
 * - cancelled: the Appointment is cancelled, so no Reminder for it is sent.
 */
export type ReminderPlan =
  | 'awaitingReview'
  | 'heldForReview'
  | 'later'
  | 'send'
  | 'tooLate'
  | 'pastWhenSet'
  | 'beforeTexts'
  | 'cancelled';

/**
 * When a Reminder's time was last worked out. One kept before the calendar recorded that is taken
 * to have been set at the Appointment's last save, the latest moment anyone could have set it.
 */
export function reminderSetAt(appointment: Appointment, reminder: Reminder): string {
  return reminder.setAt ?? (appointment.lastChanged ?? appointment.added).at;
}

export function reminderPlan(
  appointment: Appointment,
  reminder: Reminder,
  now: Date,
): ReminderPlan {
  if (appointment.state === 'cancelled') return 'cancelled';
  const due = Date.parse(reminder.dueAt);
  // Flagged so that it does not go out at a time that may no longer make sense (story 38).
  if (reminder.needsReview) return due > now.getTime() ? 'awaitingReview' : 'heldForReview';
  if (due > now.getTime()) return 'later';
  // Only a time already past when it was set; one set for that very moment is due, not past.
  if (due < Date.parse(reminderSetAt(appointment, reminder))) return 'pastWhenSet';
  if (now.getTime() < Date.parse(appointment.startsAt)) return 'send';
  return reminder.setAt === null ? 'beforeTexts' : 'tooLate';
}

/**
 * Whether a text may have reached Susan: anything sent or being sent, and anything that failed
 * after it was tried, unless the text sender refused it outright on its only try, blocked or not. Only a text the
 * calendar chose not to send, or one refused the first time, certainly did not. A text that waited
 * to be tried again and was then given up or refused, for whatever reason, counts as failed: its
 * earlier try may have gone.
 */
export function mayHaveReachedSusan(text: Text): boolean {
  if (text.status === 'notSent') return false;
  const refused = text.reason === 'refused' || text.reason === 'blocked';
  return !(text.status === 'failed' && refused && text.attempts <= 1);
}

/** The texts about an Appointment, newest due first. */
export function textsAbout(appointmentId: string, texts: readonly Text[]): Text[] {
  return texts
    .filter((text) => text.appointmentId === appointmentId)
    .sort((a, b) => b.dueAt.localeCompare(a.dueAt) || b.id.localeCompare(a.id));
}

/**
 * How a Reminder stands: the record of the text it sends at its current time, when there is one,
 * or else what will become of it.
 */
export function reminderStanding(
  appointment: Appointment,
  reminder: Reminder,
  texts: readonly Text[],
  now: Date,
): { text: Text } | { plan: ReminderPlan } {
  const id = reminderTextId(appointment, reminder);
  const text = texts.find((each) => each.id === id);
  return text ? { text } : { plan: reminderPlan(appointment, reminder, now) };
}

/**
 * A US phone number as it is kept, '+1' and ten digits, from however it was typed: "(555)
 * 555-0123", "555.555.0123", "+1 555 555 0123". Null when it is not one: area codes and exchanges
 * start with 2 to 9.
 */
export function usPhoneNumber(typed: string): string | null {
  if (!/^[\d\s().+-]+$/.test(typed)) return null;
  let digits = typed.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  if (typed.includes('+') && !/^\s*\+\s*1/.test(typed)) return null;
  return `+1${digits}`;
}

/** A kept number as a person reads it: "(555) 555-0123". */
export function formatPhone(number: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(number);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : number;
}
