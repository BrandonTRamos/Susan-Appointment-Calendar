// How a text's status reads to a person: on the Appointment detail and in Settings. The calendar
// core decides what becomes of each text (src/lib/calendar/texts.ts); this only puts it in words.

import {
  SEND_ATTEMPTS,
  SETTLING_PERIOD,
  type ChangeNotice,
  type ReminderPlan,
  type Text,
  type TextKind,
  type TextTrouble,
} from './calendar';
import { formatMoment } from './localTime';

/** A text's status in a word or two, and what more there is to say about it. */
export interface StatusWords {
  /** "Waiting", "Sent", "Delivered", "Failed", "Not sent" or "Will not be sent". */
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
  if (text.kind === 'changeNotice' && text.reason === 'outdated')
    return 'The Appointment changed again before sending went through.';
  if (text.kind === 'changeNotice' && text.reason === 'tooLate')
    return "Sending did not go through before the Appointment's old and new times had passed.";
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
      return 'Its words held a web address, which texts to Susan cannot carry, so it was not sent again.';
    case 'blocked':
      return `Not sent: texts to Susan are blocked, because she opted out. ${UNDO_BLOCK}`;
    default:
      return `Sending did not go through after ${SEND_ATTEMPTS} tries.`;
  }
}

function notSentBecause(text: Text): string {
  if (text.kind === 'changeNotice' && text.reason === 'tooLate')
    return "The Appointment's old and new times had both passed before it could go.";
  switch (text.reason) {
    case 'noNumber':
      return "Susan's mobile number was not set in Settings.";
    case 'cancelled':
      return 'The Appointment was cancelled.';
    case 'webAddress':
      return 'Its words held a web address, which texts to Susan cannot carry.';
    default:
      return 'Its time had passed and the Appointment had started before it could go.';
  }
}

/** The one way texts to Susan stop being blocked. */
export const UNDO_BLOCK =
  "Only she can undo it, by replying START to a text from the calendar's number.";

/** A kind of text in the middle of a sentence. */
const A_TEXT: Record<TextKind, string> = {
  reminder: 'a Reminder',
  changeNotice: 'a Change notice',
  automaticAnswer: 'an automatic answer',
  test: 'a test text',
};

/**
 * The banner's words while the most recent text to Susan did not get through, and where to look
 * into it: the Appointment it was about, or Settings.
 */
export function troubleWords(
  trouble: TextTrouble,
  text: Text,
): { words: string; opens: string; label: string } {
  const look = text.appointmentId
    ? { opens: `/appointments/${text.appointmentId}`, label: 'See the text' }
    : text.kind === 'automaticAnswer'
      ? { opens: '/replies', label: 'See Replies' }
      : { opens: '/settings', label: 'Open Settings' };
  const kind = A_TEXT[text.kind];
  switch (trouble) {
    case 'failed':
      return { words: `The last text to Susan, ${kind}, failed.`, ...look };
    case 'unconfirmed':
      return {
        words: `The last text to Susan, ${kind}, was not confirmed delivered. Her phone may be off.`,
        ...look,
      };
    case 'tooLate':
      return {
        words: `The last text to Susan, ${kind}, could not be sent in time.`,
        ...look,
      };
    // What happened to that text, not how Settings stand now: the number may have been entered
    // since. A later text that goes clears it.
    case 'noNumber':
      return {
        words: `The last text to Susan, ${kind}, was not sent: her mobile number was not set in Settings.`,
        opens: '/settings',
        label: 'Open Settings',
      };
    case 'webAddress':
      return {
        words: `The last text to Susan, ${kind}, was not sent: its words held a web address.`,
        ...look,
      };
    case 'blocked':
      return { ...BLOCKED_BANNER, ...look };
  }
}

/**
 * The banner's words while texts to Susan are blocked (blockedSince in src/lib/calendar/alerts.ts):
 * it stands until a text is delivered again. Settings has the test text that proves it.
 */
export const BLOCKED_BANNER = {
  words: `Texts to Susan are blocked: she opted out, so none reaches her phone. ${UNDO_BLOCK}`,
  opens: '/settings',
  label: 'Open Settings',
};

/** What the Reminder previews say when a text's words hold a web address. */
export const WEB_ADDRESS_WARNING =
  "This text holds a web address, so it will not be sent: texts to Susan cannot carry one. Take the address out of the Appointment's details; the Private notes can hold it.";

/** A Reminder still to go whose words hold a web address: it will not be sent. */
export function webAddressStatus(): StatusWords {
  return {
    label: 'Will not be sent',
    detail: 'Its words hold a web address, which texts to Susan cannot carry.',
    trouble: true,
  };
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

/** What will become of a Change notice that is owed and not yet recorded. */
export function changeNoticeStatus(
  notice: Pick<ChangeNotice, 'plan' | 'heldOvernight'>,
): StatusWords {
  if (notice.plan === 'send')
    return { label: 'Waiting', detail: 'It goes out within a minute.', trouble: false };
  if (notice.plan === 'tooLate')
    return {
      label: 'Not sent',
      detail: "The Appointment's old and new times have both passed.",
      trouble: true,
    };
  return {
    label: 'Waiting',
    detail: notice.heldOvernight
      ? 'It came up overnight, so it waits until 7:00 am.'
      : `It goes out once nobody has changed the Appointment for ${SETTLING_PERIOD / 60_000} minutes.`,
    trouble: false,
  };
}
