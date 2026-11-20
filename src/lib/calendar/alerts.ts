// Alerts: telling every Admin that a text to Susan did not get through, and the trouble the app's
// banner shows while it stands. Pure, so that the scheduled run, the commands and the screens all
// decide the same way.
//
// A text to Susan, of any kind, raises an Alert when its record reaches failed, or not sent
// because it could not go in time or because Susan's number was not set, whatever caused it. The
// core marks the Alert due in the same write that settles the text (`alertMarked`), and the
// scheduled run sends it to every Admin by email and by app notification: one Alert per text, each
// delivery sent once and recorded as it goes, and any that failed tried again. Susan is not an
// Admin, so she is never told.

import { formatDate, formatMoment, formatTime } from '../localTime';
import type { Appointment } from './appointment';
import type { AdminEmail, AppNotification } from './ports';
import { SEND_ATTEMPTS, type Text, type TextAlert, type TextKind } from './texts';
import { holdsWebAddress } from './webAddress';

/**
 * What went wrong with a text. failed: it was refused, or did not go through, or was reported not
 * delivered. unconfirmed: it was sent but never confirmed delivered. tooLate: it could not be sent
 * before the Appointment started. noNumber: it was not sent because Susan's mobile number was not
 * set when it came due, which is a gap in the setup, not a failure. webAddress: it was never sent
 * because its words held a web address, which no text may carry.
 */
export type TextTrouble = 'failed' | 'unconfirmed' | 'tooLate' | 'noNumber' | 'webAddress';

/** What went wrong with a text, or null when nothing did, or it is still being sent. */
export function troubleOf(text: Text): TextTrouble | null {
  if (text.status === 'failed') return text.reason === 'unconfirmed' ? 'unconfirmed' : 'failed';
  if (text.status !== 'notSent') return null;
  if (text.reason === 'tooLate') return 'tooLate';
  if (text.reason === 'noNumber') return 'noNumber';
  if (text.reason === 'webAddress') return 'webAddress';
  return null;
}

/** An Alert that is to be sent and has not been tried. */
export const NEW_ALERT: TextAlert = { state: 'due', tries: 0, triedAt: null, sent: [] };

/**
 * The record as it is to be kept, with its Alert marked due when it has just come to need one.
 * Every write of a text's record in the core goes through this, so a text raises an Alert however
 * it came to fail: in sending, in trying again, or when its delivery is reported (`deliveredText`).
 */
export function alertMarked(text: Text): Text {
  if (text.alert !== null || !troubleOf(text)) return text;
  return { ...text, alert: NEW_ALERT };
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
    case 'webAddress':
      return 'it was not tried again, because its words now hold a web address, which no text may carry';
    default:
      return `sending did not go through after ${SEND_ATTEMPTS} tries`;
  }
}

/** What may follow for Susan from a text of this kind not reaching her. */
const MAY_NOT: Record<TextKind, string> = {
  reminder: 'She may not have been reminded.',
  changeNotice: 'She may not know the Appointment changed.',
  automaticAnswer: 'She may not have been told who to call.',
  test: 'Texts may not be reaching her phone.',
};
/** What follows for Susan from a text of this kind that was never sent. */
const DID_NOT: Record<TextKind, string> = {
  reminder: 'She was not reminded.',
  changeNotice: 'She was not told of the change.',
  automaticAnswer: 'She was not told who to call.',
  test: 'It did not go to her phone.',
};

/** How each trouble is said: what became of the text, why, and what follows for Susan. */
function said(trouble: TextTrouble, text: Text) {
  switch (trouble) {
    case 'failed':
      return { became: 'failed', why: failedBecause(text), after: MAY_NOT[text.kind] };
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
        after: DID_NOT[text.kind],
      };
    case 'webAddress':
      // Never the address itself: the reader opens the Appointment to take it out.
      return {
        became: 'was not sent',
        why: 'its words held a web address, which no text to her may carry',
        after: `${DID_NOT[text.kind]} Take the address out of the Appointment's details; the Private notes can hold it.`,
      };
    case 'noNumber':
      // Said as what happened then: the number may have been set since.
      return {
        became: 'was not sent',
        why: 'her mobile number was not set in Settings when it came due',
        after: `${DID_NOT[text.kind]} Setting her number now does not send this one.`,
      };
  }
}

/** Where to look into a text that concerns no Appointment. */
const OPENS: Record<TextKind, string> = {
  reminder: '/',
  changeNotice: '/',
  automaticAnswer: '/replies',
  test: '/settings',
};

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
  const a = `${text.kind === 'automaticAnswer' ? 'an' : 'a'} ${name}`;
  const A = `${a.charAt(0).toUpperCase()}${a.slice(1)}`;
  const { became, why, after } = said(trouble, text);
  // Never a web address, as no text carries one: an Appointment named by one is named by its time.
  const which = appointment
    ? `${holdsWebAddress(appointment.what) ? 'an Appointment' : appointment.what}, ${formatDate(appointment.date, 'short')} at ${formatTime(appointment.time)}`
    : text.appointmentId
      ? 'one that is no longer in the calendar'
      : null;
  const opens = appointment ? `/appointments/${appointment.id}` : OPENS[text.kind];
  const subject =
    trouble === 'noNumber'
      ? `Susan's Calendar alert: ${a} was not sent, because Susan's mobile number was not set`
      : trouble === 'webAddress'
        ? `Susan's Calendar alert: ${a} was not sent, because it held a web address`
        : `Susan's Calendar alert: ${a} ${became}`;
  const about =
    which !== null
      ? `Appointment: ${which}`
      : text.kind === 'test'
        ? 'It was sent from Settings, to check that texts reach her phone. Its status is in Settings.'
        : 'It concerns no Appointment.';
  const body =
    `${A} to Susan ${became}: ${why}. ${after}\n\n` +
    `${about}\n` +
    `Text: the ${name} ${text.kind === 'test' ? 'asked for' : 'due'} ${formatMoment(text.dueAt, timeZone)}\n\n` +
    (which === null
      ? 'You may want to call Susan.'
      : 'You may want to call Susan. The Appointment and its texts are in the app.');
  const short =
    trouble === 'noNumber'
      ? `${A} was not sent: Susan's mobile number was not set.${which ? ` ${which}.` : ''}`
      : trouble === 'webAddress'
        ? `${A} was not sent: its words held a web address.${which ? ` ${which}.` : ''}`
        : `${A} ${became}${which ? `: ${which}.` : '.'} ${after}`;
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
