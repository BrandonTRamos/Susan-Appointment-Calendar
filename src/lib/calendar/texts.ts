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
 * took it. Delivered: the carrier accepted it for her phone (ticket 13). Failed: it was refused, or
 * sending kept failing. Not sent: the calendar chose not to send it, for a reason it records.
 */
export type TextStatus = (typeof TEXT_STATUSES)[number];

export const TEXT_REASONS = ['noNumber', 'tooLate', 'cancelled', 'refused', 'gaveUp'] as const;
/**
 * Why a text failed or was not sent. noNumber: Susan's mobile number is not set. tooLate: the
 * Appointment had started. cancelled: the Appointment was cancelled while the text waited.
 * refused: the text sender would not take it. gaveUp: sending failed every time it was tried.
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
  /** The text sender's own name for it, for asking later what became of it. */
  reference: string | null;
}

/** Where texts go, and who Susan is told to call. Changed only through the calendar core. */
export interface CalendarSettings {
  /** Susan's mobile number, '+1' and ten digits. Nothing is sent while it is not set. */
  susansNumber: string | null;
  /** Who the automatic answer to a Reply tells her to call, and their number. */
  contactName: string | null;
  contactPhone: string | null;
  /** Null until someone changes them. */
  lastChanged: Stamp | null;
}

export const NO_SETTINGS: CalendarSettings = {
  susansNumber: null,
  contactName: null,
  contactPhone: null,
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

/** The ID of the text a Reminder sends at the time it is now due. */
export function reminderTextId(appointment: Pick<Appointment, 'id'>, reminder: Reminder): string {
  return `reminder:${appointment.id}:${reminder.id}:${reminder.dueAt}`;
}

/** The ID of a test text asked for at a moment. */
export const testTextId = (at: string) => `test:${at}`;

/**
 * What becomes of a Reminder, as things stand at `now`, before any text for it is recorded:
 *
 * - later: its time has not come.
 * - send: it is due, or overdue while the Appointment has not started.
 * - tooLate: its time came and went and the Appointment has now started: recorded as not sent.
 * - pastWhenSet: its time had already passed when it was set, so it is never sent.
 * - beforeTexts: it was set before the calendar kept when each Reminder's time was set, and its
 *   Appointment has started; nothing was going to send it then, so it is let go unrecorded.
 * - cancelled: the Appointment is cancelled, so no Reminder for it is sent.
 */
export type ReminderPlan =
  'later' | 'send' | 'tooLate' | 'pastWhenSet' | 'beforeTexts' | 'cancelled';

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
  if (due > now.getTime()) return 'later';
  if (due <= Date.parse(reminderSetAt(appointment, reminder))) return 'pastWhenSet';
  if (now.getTime() < Date.parse(appointment.startsAt)) return 'send';
  return reminder.setAt === null ? 'beforeTexts' : 'tooLate';
}

/**
 * Whether a text may have reached Susan: anything sent or being sent, and anything that failed
 * after it was tried, unless the text sender refused it outright. Only a text the calendar chose
 * not to send, or one refused, certainly did not.
 */
export function mayHaveReachedSusan(text: Text): boolean {
  if (text.status === 'notSent') return false;
  return !(text.status === 'failed' && text.reason === 'refused');
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
