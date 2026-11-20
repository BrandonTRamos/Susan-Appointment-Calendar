// The text sender that reaches Susan's phone: Textbelt (docs/adr/0002-textbelt-for-text-messages.md).
// This is the only code that knows Textbelt: its address, its requests, its answers and its
// statuses. The calendar core sees only the text sender port (src/lib/calendar/ports.ts), so moving
// to another way of sending texts replaces this file and nothing else.
//
// What Textbelt's documentation says of each request and answer is in docs/text-message-setup.md,
// "What Textbelt's documentation says".

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  usPhoneNumber,
  type DeliveryReport,
  type IncomingReply,
  type SendResult,
  type TextSender,
} from '../../src/lib/calendar';
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

/**
 * The `error` words of a refused send that mean the number has opted out, as by replying STOP, so
 * that texts to it are blocked. Textbelt documents none: what a send to a number that has opted
 * out returns is to be seen on a real phone (ticket 17; docs/text-message-setup.md, "STOP and
 * HELP"). Until the owner's check records the words here, such a send is an ordinary refusal: it
 * fails, and its Alert says so.
 */
export const TEXTBELT_OPTED_OUT_ERRORS: readonly string[] = [];

export interface TextbeltOptions {
  /** The Textbelt key: the deployment secret TEXTBELT_KEY (amplify/calendar/text-sender.ts). */
  key: string;
  /**
   * The calendar's reply address, the text-replies function's public address (amplify/backend.ts),
   * named in every text sent so that Susan's Replies come back to it. Null where there is none.
   */
  replyTo?: string | null;
  /** The refusals that mean texts to the number are blocked; a test hands in its own. */
  optedOutErrors?: readonly string[];
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
  replyTo = null,
  optedOutErrors = TEXTBELT_OPTED_OUT_ERRORS,
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
        body: new URLSearchParams({
          phone,
          message: words,
          key,
          // Where her Replies go. A request field, not part of the words she reads.
          ...(replyTo ? { replyWebhookUrl: replyTo } : {}),
        }),
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
      if (body?.success === false) {
        const error = typeof body.error === 'string' ? body.error.trim() : '';
        const blocked = error !== '' && optedOutErrors.includes(error);
        return {
          sent: false,
          ...(blocked ? { blocked } : {}),
          creditLeft: credit(body.quotaRemaining),
        };
      }
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

/** How old a Reply's timestamp may be, as Textbelt's documentation says: 15 minutes. */
export const REPLY_MAX_AGE = 15 * 60_000;

/** The largest Reply request read: far more than a text and its fields. */
const REPLY_MAX_BYTES = 16_384;

/**
 * Why a request to the reply address was not taken as a Reply. unsigned: it carried no signature
 * or timestamp in Textbelt's form. forged: its signature was not made with the key. stale: its
 * timestamp was more than REPLY_MAX_AGE from now, either way. unreadable: it was signed, but not a
 * Reply in Textbelt's form.
 */
export type ReplyRejection = 'unsigned' | 'forged' | 'stale' | 'unreadable';

export interface ReplyRequest {
  /** The request's headers, by any case. */
  headers: Readonly<Record<string, string | undefined>>;
  /** Its body, exactly as it came: the signature is made over these characters. */
  body: string;
  now: Date;
}

/** A request's header, by any case. */
const header = (headers: ReplyRequest['headers'], name: string) =>
  Object.entries(headers)
    .find(([key]) => key.toLowerCase() === name)?.[1]
    ?.trim() ?? '';

/**
 * A Reply as Textbelt sends it to the reply address, or why it is not one. Textbelt signs each with
 * the key: `X-textbelt-signature` is the hex HMAC-SHA256 of `X-textbelt-timestamp` (UNIX seconds)
 * followed by the raw JSON body, which is `{"textId", "fromNumber", "text"}` (docs.textbelt.com,
 * "Receiving SMS replies"). Checked in constant time, before anything in the body is read; then
 * the timestamp must be within 15 minutes of now. What identifies the Reply is made from its
 * signature, so the same request arriving twice is kept once. Nothing here logs anything.
 */
export function readTextbeltReply(
  key: string,
  { headers, body, now }: ReplyRequest,
): { reply: IncomingReply } | { rejected: ReplyRejection } {
  const signature = header(headers, 'x-textbelt-signature').toLowerCase();
  const timestamp = header(headers, 'x-textbelt-timestamp');
  if (!key || !/^[0-9a-f]{64}$/.test(signature) || !/^\d{1,12}$/.test(timestamp))
    return { rejected: 'unsigned' };
  if (Buffer.byteLength(body, 'utf8') > REPLY_MAX_BYTES) return { rejected: 'forged' };
  const made = createHmac('sha256', key)
    .update(timestamp + body)
    .digest();
  if (!timingSafeEqual(made, Buffer.from(signature, 'hex'))) return { rejected: 'forged' };
  if (Math.abs(now.getTime() - Number(timestamp) * 1000) > REPLY_MAX_AGE)
    return { rejected: 'stale' };
  let said: unknown;
  try {
    said = JSON.parse(body);
  } catch {
    return { rejected: 'unreadable' };
  }
  if (typeof said !== 'object' || said === null || Array.isArray(said))
    return { rejected: 'unreadable' };
  const { textId, text, fromNumber } = said as Record<string, unknown>;
  // All three, in the form Textbelt documents: the text that began the conversation, the number
  // the Reply came from, as one the calendar can read, and the words.
  const identified =
    (typeof textId === 'string' && /^[\w-]{1,64}$/.test(textId)) ||
    (typeof textId === 'number' && Number.isSafeInteger(textId) && textId >= 0);
  const from = typeof fromNumber === 'string' ? usPhoneNumber(fromNumber) : null;
  if (!identified || !from || typeof text !== 'string') return { rejected: 'unreadable' };
  return {
    reply: {
      key: createHash('sha256').update(signature).digest('hex').slice(0, 40),
      words: text,
      from,
    },
  };
}
