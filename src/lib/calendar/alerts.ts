// Alerts: telling every Admin that a text to Susan did not get through, and the trouble the app's
// banner shows while it stands. Pure, so that the scheduled run, the commands and the screens all
// decide the same way.
//
// A Reminder or Change notice raises an Alert when its record reaches failed, or not sent because
// it could not go in time or because Susan's number is not set, whatever caused it. The core marks
// the Alert due in the same write that settles the text (`alertMarked`), and the run raises each
// due Alert once, by a conditional write, by email and by app notification to every Admin.
// Susan is not an Admin, so she is never told.

import { formatDate, formatMoment, formatTime } from '../localTime';
import type { Appointment } from './appointment';
import type { AdminEmail, AppNotification } from './ports';
import { SEND_ATTEMPTS, type Text, type TextKind } from './texts';

/**
 * What went wrong with a text. failed: it was refused, or did not go through, or was reported not
 * delivered. unconfirmed: it was sent but never confirmed delivered. tooLate: it could not be sent
 * before the Appointment started. noNumber: it was not sent because Susan's mobile number is not
 * set, which is a gap in the setup, not a failure.
 */
export type TextTrouble = 'failed' | 'unconfirmed' | 'tooLate' | 'noNumber';

/** What went wrong with a text, or null when nothing did, or it is still being sent. */
export function troubleOf(text: Text): TextTrouble | null {
  if (text.status === 'failed') return text.reason === 'unconfirmed' ? 'unconfirmed' : 'failed';
  if (text.status !== 'notSent') return null;
  if (text.reason === 'tooLate') return 'tooLate';
  if (text.reason === 'noNumber') return 'noNumber';
  return null;
}

/** The kinds of text an Alert is raised about: the ones about an Appointment (CONTEXT.md). */
const ALERTED: readonly TextKind[] = ['reminder', 'changeNotice'];

/**
 * The record as it is to be kept, with its Alert marked due when it has just come to need one.
 * Every write of a text's record in the core goes through this, so a text raises an Alert however
 * it came to fail: in sending, in trying again, or when its delivery is reported (`deliveredText`).
 */
export function alertMarked(text: Text): Text {
  if (text.alert !== null || !ALERTED.includes(text.kind) || !troubleOf(text)) return text;
  return { ...text, alert: 'due' };
}

/** What the text sender says became of a text after it took it. */
export type DeliveryOutcome =
  /** The carrier accepted it for her phone. Never that she read it. */
  | 'delivered'
  /** The text sender reported that it could not be delivered. */
  | 'undelivered'
  /** No confirmation came within the time allowed: "not confirmed delivered". */
  | 'unconfirmed';

/**
 * The record of a sent text once its delivery is known: the one place a delivery report becomes a
 * status. Whoever learns it (ticket 13's Textbelt sender, through the core's `recordDelivery`) says
 * only what became of it, in these provider-neutral words.
 */
export function deliveredText(text: Text, outcome: DeliveryOutcome): Text {
  if (outcome === 'delivered') return { ...text, status: 'delivered', reason: null };
  return alertMarked({ ...text, status: 'failed', reason: outcome });
}

/**
 * The trouble the banner shows: what went wrong with the most recent text to Susan of any kind,
 * once it was settled, or null when it went. A text still being sent is passed over, so a failure
 * stands until a later text goes.
 */
export function textTrouble(texts: readonly Text[]): { trouble: TextTrouble; text: Text } | null {
  const settled = texts.filter(
    (text) => text.status === 'sent' || text.status === 'delivered' || troubleOf(text) !== null,
  );
  const [latest] = [...settled].sort(
    (a, b) => b.triedAt.localeCompare(a.triedAt) || b.id.localeCompare(a.id),
  );
  const trouble = latest ? troubleOf(latest) : null;
  return trouble ? { trouble, text: latest } : null;
}

const NAMES: Record<TextKind, string> = {
  reminder: 'Reminder',
  changeNotice: 'Change notice',
  automaticAnswer: 'automatic answer',
  test: 'test text',
};

/** Why a failed text failed, as the rest of a sentence. */
function failedBecause(text: Text): string {
  switch (text.reason) {
    case 'refused':
      return 'the text was refused, so it did not go';
    case 'tooLate':
      return 'sending did not go through before the Appointment started';
    case 'cancelled':
      return 'sending did not go through before the Appointment was cancelled';
    case 'outdated':
      return 'sending did not go through before its Reminder was changed or removed';
    case 'noNumber':
      return "Susan's mobile number was taken out of Settings before it went";
    case 'undelivered':
      return 'her phone company reported that it could not be delivered';
    default:
      return `sending did not go through after ${SEND_ATTEMPTS} tries`;
  }
}

/** How each trouble is said: what became of the text, why, and what follows for Susan. */
function said(trouble: TextTrouble, text: Text) {
  const reminder = text.kind === 'reminder';
  switch (trouble) {
    case 'failed':
      return {
        became: 'failed',
        why: failedBecause(text),
        after: reminder
          ? 'She may not have been reminded.'
          : 'She may not know the Appointment changed.',
      };
    case 'unconfirmed':
      return {
        became: 'was not confirmed delivered',
        why: 'her phone company has not confirmed that it reached her phone. Her phone may be off or out of signal',
        after: 'It may not have reached her.',
      };
    case 'tooLate':
      return {
        became: 'could not be sent in time',
        why: 'the Appointment had started before it could go',
        after: reminder ? 'She was not reminded.' : 'She was not told of the change.',
      };
    case 'noNumber':
      return {
        became: 'was not sent',
        why: 'her mobile number is not set in Settings, so no texts are being sent to her',
        after: `${reminder ? 'She was not reminded.' : 'She was not told of the change.'} Setting her number now does not send this one.`,
      };
  }
}

/** An Alert, in both the forms it goes in. */
export interface Alert {
  email: AdminEmail;
  notification: AppNotification;
}

/**
 * The words of the Alert about a text: which Appointment and which text it concerns, and why it is
 * raised. Nothing more personal: not Susan's number, nor the text's words, nor the Appointment's
 * place, Driver, notes or who it is with. Whoever reads it opens the Appointment for those, behind
 * the sign-in. `appointment` is null when it is no longer in the calendar.
 */
export function alertFor(text: Text, appointment: Appointment | null, timeZone: string): Alert {
  const trouble = troubleOf(text) ?? 'failed';
  const name = NAMES[text.kind];
  const { became, why, after } = said(trouble, text);
  const which = appointment
    ? `${appointment.what}, ${formatDate(appointment.date, 'short')} at ${formatTime(appointment.time)}`
    : 'one that is no longer in the calendar';
  const opens = appointment ? `/appointments/${appointment.id}` : '/';
  const subject =
    trouble === 'noNumber'
      ? `Susan's Calendar alert: a ${name} was not sent, because Susan's mobile number is not set`
      : `Susan's Calendar alert: a ${name} ${became}`;
  const body =
    `A ${name} to Susan ${became}: ${why}. ${after}\n\n` +
    `Appointment: ${which}\n` +
    `Text: the ${name} due ${formatMoment(text.dueAt, timeZone)}\n\n` +
    'You may want to call Susan. The Appointment and its texts are in the app.';
  const short =
    trouble === 'noNumber'
      ? `A ${name} was not sent: Susan's mobile number is not set. ${which}.`
      : `A ${name} ${became}: ${which}. ${after}`;
  return {
    email: { subject, body, opens },
    notification: {
      title: "Susan's Calendar alert",
      body: short,
      opens,
      // Each Alert stands on its own on a device: a later one does not take its place.
      tag: `alert-${text.id}`,
    },
  };
}
