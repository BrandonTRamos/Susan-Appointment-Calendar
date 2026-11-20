// How a text's status reads to a person: on the Appointment detail and in Settings. The calendar
// core decides what becomes of each text (src/lib/calendar/texts.ts); this only puts it in words.

import { SEND_ATTEMPTS, type ReminderPlan, type Text, type TextKind } from './calendar';
import { formatMoment } from './localTime';

/** A text's status in a word or two, and what more there is to say about it. */
export interface StatusWords {
  /** "Waiting", "Sent", "Delivered", "Failed" or "Not sent". */
  label: string;
  /** Why, or when; null when the label says it all. */
  detail: string | null;
  /** Whether a person should look into it. */
  trouble: boolean;
}

export const KIND_NAMES: Record<TextKind, string> = {
  reminder: 'Reminder',
  changeNotice: 'Change notice',
  automaticAnswer: 'Automatic answer',
  test: 'Test text',
};

/** What the record of a text says has become of it. */
export function textStatus(text: Text, timeZone: string): StatusWords {
  switch (text.status) {
    case 'waiting':
      return {
        label: 'Waiting',
        detail:
          text.attempts > 1
            ? `Sending did not go through; trying again (try ${text.attempts} of ${SEND_ATTEMPTS}).`
            : 'Being sent now.',
        trouble: text.attempts > 1,
      };
    // Delivered means only that: the calendar never says she read it.
    case 'sent':
      return {
        label: 'Sent',
        detail: text.sentAt ? formatMoment(text.sentAt, timeZone) : null,
        trouble: false,
      };
    case 'delivered':
      return {
        label: 'Delivered',
        detail: 'Her phone company accepted it for her phone.',
        trouble: false,
      };
    case 'failed':
      return { label: 'Failed', detail: failedBecause(text), trouble: true };
    case 'notSent':
      return { label: 'Not sent', detail: notSentBecause(text), trouble: true };
  }
}

function failedBecause(text: Text): string {
  switch (text.reason) {
    case 'refused':
      return 'The text was refused, so it did not go.';
    case 'tooLate':
      return 'Sending did not go through before the Appointment started.';
    case 'noNumber':
      return "Susan's mobile number was taken out of Settings before it went.";
    case 'cancelled':
      return 'The Appointment was cancelled before sending went through.';
    case 'outdated':
      return 'Its Reminder was changed or removed before sending went through.';
    case 'undelivered':
      return 'Her phone company reported that it was not delivered.';
    case 'unconfirmed':
      return 'Not confirmed delivered: no word came in time that her phone company accepted it.';
    case 'webAddress':
      return 'It held a web address, which texts to Susan cannot carry.';
    default:
      return `Sending did not go through after ${SEND_ATTEMPTS} tries.`;
  }
}

function notSentBecause(text: Text): string {
  switch (text.reason) {
    case 'noNumber':
      return "Susan's mobile number was not set in Settings.";
    case 'cancelled':
      return 'The Appointment was cancelled.';
    case 'webAddress':
      return 'It held a web address, which texts to Susan cannot carry.';
    default:
      return 'Its time had passed and the Appointment had started before it could go.';
  }
}

/** What will become of a Reminder that has no text recorded yet. */
export function planStatus(plan: ReminderPlan): StatusWords {
  switch (plan) {
    case 'awaitingReview':
      return {
        label: 'Waiting for review',
        detail:
          'The Appointment moved, so this goes out only once someone keeps its time or changes it.',
        trouble: true,
      };
    case 'heldForReview':
      return {
        label: 'Not sent',
        detail: 'Its time came while it was waiting for review.',
        trouble: true,
      };
    case 'later':
      return { label: 'Waiting', detail: null, trouble: false };
    case 'send':
      return { label: 'Waiting', detail: 'It goes out within a minute.', trouble: false };
    case 'tooLate':
      return {
        label: 'Not sent',
        detail: 'Its time passed and the Appointment started before it could go.',
        trouble: true,
      };
    case 'pastWhenSet':
      return {
        label: 'Not sent',
        detail: 'Its time had already passed when it was set.',
        trouble: false,
      };
    case 'beforeTexts':
      return {
        label: 'Not sent',
        detail: 'Its time passed before the calendar sent texts.',
        trouble: false,
      };
    case 'cancelled':
      return { label: 'Not sent', detail: 'The Appointment is cancelled.', trouble: false };
  }
}
