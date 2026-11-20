// The text sender that reaches Susan's phone: Textbelt (docs/adr/0002-textbelt-for-text-messages.md).
// This is the only code that knows Textbelt: its address, its requests, its answers and its
// statuses. The calendar core sees only the text sender port (src/lib/calendar/ports.ts), so moving
// to another way of sending texts replaces this file and nothing else.
//
// What Textbelt's documentation says of each request and answer is in docs/text-message-setup.md,
// "What Textbelt's documentation says".

import type { DeliveryReport, SendResult, TextSender } from '../../src/lib/calendar';
import { failureKind } from '../../src/lib/failure';

const TEXTBELT = 'https://textbelt.com';

/**
 * Textbelt's delivery statuses, and what each means to the calendar: the one place they are
 * mapped. DELIVERED: the carrier confirmed it. FAILED: not received. SENDING (queued or with the
 * carrier), SENT (with the carrier, no receipt) and UNKNOWN settle nothing, so the text stays sent.
 * Any status not listed here settles nothing either.
 */
export const TEXTBELT_STATUSES: Readonly<Record<string, DeliveryReport>> = {
  DELIVERED: 'delivered',
  FAILED: 'failed',
  SENDING: 'pending',
  SENT: 'pending',
  UNKNOWN: 'pending',
};

export interface TextbeltOptions {
  /** The Textbelt key: the deployment secret TEXTBELT_KEY (amplify/calendar/text-sender.ts). */
  key: string;
  /** How requests are made; a test hands in a stand-in that answers with recorded examples. */
  fetch?: typeof fetch;
  /** How long a send may take before nobody can tell whether it went. */
  timeoutMs?: number;
  /**
   * How long a question about a text's status may take. Shorter than a send: the scheduled run asks
   * a few at a time (STATUS_READS_AT_ONCE) and must end within its minute, and a status not read
   * now is asked for again on the next run.
   */
  statusTimeoutMs?: number;
}

/**
 * Fixed words for a failure, never the error's own, which could quote the number, the words or the
 * key it was sent: the operation, and the kind of failure (src/lib/failure.ts).
 */
const failed = (what: string, error?: unknown) =>
  new Error(`Textbelt ${what} failed (${error === undefined ? 'unknown' : failureKind(error)})`);

/** A whole number of credits, from an answer that may or may not hold one. */
const credit = (said: unknown): number | null =>
  typeof said === 'number' && Number.isInteger(said) && said >= 0 ? said : null;

export function textbeltSender({
  key,
  fetch: request = fetch,
  timeoutMs = 10_000,
  statusTimeoutMs = 5_000,
}: TextbeltOptions): TextSender {
  /** Textbelt's answer to a request, read as JSON; null when there was none worth reading. */
  async function answer(what: string, url: string, waitMs: number, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await request(url, { ...init, signal: AbortSignal.timeout(waitMs) });
    } catch (error) {
      throw failed(what, error);
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON: an error page from something in the way, or a cut-off answer.
    }
    return { ok: response.ok, status: response.status, body: body as Record<string, unknown> };
  }

  return {
    async send({ to, words }): Promise<SendResult> {
      // Kept as '+1' and ten digits; Textbelt takes the ten digits of a US number.
      const phone = /^\+1(\d{10})$/.exec(to)?.[1];
      if (!phone) return { sent: false };
      const { body } = await answer('send', `${TEXTBELT}/text`, timeoutMs, {
        method: 'POST',
        body: new URLSearchParams({ phone, message: words, key }),
      });
      // Textbelt's own yes or no, whatever the HTTP status: `success: false` is a refusal, such as
      // "Out of quota", and the text certainly did not go. Anything that is not Textbelt's answer,
      // such as a gateway's error page or an answer cut off, cannot say whether it went: it is
      // tried again.
      if (body?.success === true) {
        const { textId, quotaRemaining } = body;
        const reference =
          typeof textId === 'number' || (typeof textId === 'string' && textId)
            ? String(textId)
            : null;
        return { sent: true, reference, creditLeft: credit(quotaRemaining) };
      }
      if (body?.success === false) return { sent: false, creditLeft: credit(body.quotaRemaining) };
      throw failed('send');
    },

    async delivery(reference) {
      const { ok, body } = await answer(
        'status',
        `${TEXTBELT}/status/${encodeURIComponent(reference)}`,
        statusTimeoutMs,
      );
      const status = body?.status;
      if (!ok || typeof status !== 'string') throw failed('status');
      return Object.hasOwn(TEXTBELT_STATUSES, status) ? TEXTBELT_STATUSES[status] : 'pending';
    },
  };
}
