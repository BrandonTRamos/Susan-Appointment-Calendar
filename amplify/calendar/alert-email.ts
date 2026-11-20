// Email to Admins, through AWS's email service (SES, its v2 API), in the backend's own region. The
// calendar core's Admin messenger (admin-messenger.ts) uses it for Alerts.
//
// AWS's documentation, checked on 20 November 2026: an account in the SES sandbox, with no
// production access, can send only from a verified identity to verified email addresses or domains,
// at most 200 messages a day and one a second, and the sandbox is separate in each region. That is
// enough for a handful of Admins, each of whose sign-in addresses the owner verifies (README,
// "Alert emails"). AWS recommends one SendEmail call per recipient, since a call that fails rejects
// the whole email, so each Admin gets their own.
//
// Nothing here logs or throws an address, a subject or a body: only the operation and the error's
// name, such as MessageRejected.

import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { failureKind } from '../../src/lib/failure';

/** One email to one person. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  /** Plain text. */
  body: string;
}

/**
 * What became of one email. sent: SES accepted it. rejected: SES refused it and would again, as for
 * an address the sandbox has not verified. failed: it could not be sent even after trying again.
 */
export type EmailResult = 'sent' | 'rejected' | 'failed';

export interface EmailSender {
  send(email: OutgoingEmail): Promise<EmailResult>;
}

/** The part of the SES client the sender uses. */
export interface EmailClient {
  send(command: SendEmailCommand): Promise<{ MessageId?: string }>;
}

/** How many times an email is tried when SES is busy or cannot be reached. */
export const EMAIL_ATTEMPTS = 3;
/** The sandbox sends at most one email a second; emails are spaced at least this far apart. */
export const EMAIL_SPACING_MS = 1100;

/** What an SES error says about itself: its name and, for an HTTP error, its status. */
function described(error: unknown) {
  const e = (typeof error === 'object' && error !== null ? error : {}) as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return {
    name: typeof e.name === 'string' && /^[A-Za-z]+$/.test(e.name) ? e.name : null,
    status: typeof e.$metadata?.httpStatusCode === 'number' ? e.$metadata.httpStatusCode : null,
  };
}

/** Whether trying again soon may work: SES is busy, or it or the network did not answer. */
function passing(error: unknown): boolean {
  const { name, status } = described(error);
  if (name && /TooManyRequests|Throttl|ServiceUnavailable|InternalFailure/i.test(name)) return true;
  if (status !== null) return status === 429 || status >= 500;
  return ['timeout', 'network'].includes(failureKind(error));
}

export interface SesSenderOptions {
  /** The verified address Alerts come from. */
  from: string;
  client?: EmailClient;
  /** Waits, between tries and between emails. Tests pass one that does not. */
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Sends each email through SES on its own, spaced out and tried again when SES is busy. */
export function sesEmailSender({
  from,
  client = new SESv2Client({}),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}: SesSenderOptions): EmailSender {
  let last = -Infinity;
  return {
    async send({ to, subject, body }) {
      for (let attempt = 1; ; attempt += 1) {
        const gap = last + EMAIL_SPACING_MS - now();
        if (gap > 0) await wait(gap);
        last = now();
        try {
          await client.send(
            new SendEmailCommand({
              FromEmailAddress: from,
              Destination: { ToAddresses: [to] },
              Content: {
                Simple: {
                  Subject: { Data: subject, Charset: 'UTF-8' },
                  Body: { Text: { Data: body, Charset: 'UTF-8' } },
                },
              },
            }),
          );
          return 'sent';
        } catch (error) {
          const { name } = described(error);
          // Its name only: an SES message can repeat the address it was sent to.
          console.error(`Alert email failed (${name ?? failureKind(error)})`);
          if (!passing(error)) return 'rejected';
          if (attempt >= EMAIL_ATTEMPTS) return 'failed';
          await wait(attempt * 1000);
        }
      }
    },
  };
}

/**
 * The verified address Alerts are emailed from, from the ALERT_EMAIL_FROM setting, or null when it
 * is not set, and then Alerts go by app notification only. A value that is not an email address
 * fails the deploy.
 */
export function resolveAlertSender(configured: string | undefined | null): string | null {
  const email = configured?.trim();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error(
      `ALERT_EMAIL_FROM is not an email address: "${email}". Use one such as alerts@example.com.`,
    );
  return email;
}
