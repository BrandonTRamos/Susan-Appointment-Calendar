import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  EMAIL_ATTEMPTS,
  resolveAlertSender,
  sesEmailSender,
  type EmailClient,
} from './alert-email';

afterEach(() => vi.restoreAllMocks());

/**
 * An SES error as the SDK throws it, from the answers AWS documents for SendEmail (SES API v2):
 * its name, an HTTP status, and a message that can repeat the address it was sent to. Synthetic:
 * nothing here reached AWS.
 */
function sesError(name: string, httpStatusCode: number, message: string) {
  return Object.assign(new Error(message), { name, $metadata: { httpStatusCode } });
}

/** A client that answers each call in turn, and keeps what it was asked. */
function ses(...answers: (Error | { MessageId: string })[]) {
  const asked: SendEmailCommand['input'][] = [];
  const client: EmailClient = {
    async send(command) {
      asked.push(command.input);
      const answer = answers.shift() ?? { MessageId: 'synthetic-message-id' };
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return { client, asked };
}

const email = {
  to: 'linda@example.com',
  subject: "Susan's Calendar alert: a Reminder failed",
  body: 'A Reminder to Susan failed.',
};

/** A sender whose waiting takes no time, on a clock that waiting moves on. */
function sender(client: EmailClient) {
  let now = 0;
  const waited: number[] = [];
  const sent = sesEmailSender({
    from: 'alerts@example.com',
    client,
    now: () => now,
    wait: async (ms) => {
      waited.push(ms);
      now += ms;
    },
  });
  return { sent, waited };
}

describe('Alert emails through SES', () => {
  it('send one plain-text email to one address, from the verified sender', async () => {
    const { client, asked } = ses({ MessageId: 'synthetic-0001' });
    expect(await sender(client).sent.send(email)).toBe('sent');
    expect(asked).toEqual([
      {
        FromEmailAddress: 'alerts@example.com',
        Destination: { ToAddresses: ['linda@example.com'] },
        Content: {
          Simple: {
            Subject: { Data: email.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: email.body, Charset: 'UTF-8' } },
          },
        },
      },
    ]);
  });

  it('space emails at least a second apart, as the sandbox allows', async () => {
    const { client } = ses();
    const { sent, waited } = sender(client);
    await sent.send(email);
    await sent.send({ ...email, to: 'mark@example.com' });
    expect(waited).toEqual([1100]);
  });

  it('are refused for good, and not tried again, for an address the sandbox has not verified', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, asked } = ses(
      sesError(
        'MessageRejected',
        400,
        'Email address is not verified. The following identities failed the check in region US-EAST-1: linda@example.com',
      ),
    );
    expect(await sender(client).sent.send(email)).toBe('rejected');
    expect(asked).toHaveLength(1);
    // Its name only: never the address, the subject or the words.
    expect(logged.mock.calls.flat().join(' ')).toBe('Alert email failed (MessageRejected)');
  });

  it('are refused for good while sending is paused or the sender is not verified', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const name of ['SendingPausedException', 'MailFromDomainNotVerifiedException']) {
      const { client, asked } = ses(sesError(name, 400, 'Synthetic.'));
      expect(await sender(client).sent.send(email)).toBe('rejected');
      expect(asked).toHaveLength(1);
    }
  });

  it('are tried again when SES is busy, and sent once it takes them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, asked } = ses(
      sesError('TooManyRequestsException', 429, 'Maximum sending rate exceeded.'),
      { MessageId: 'synthetic-0002' },
    );
    expect(await sender(client).sent.send(email)).toBe('sent');
    expect(asked).toHaveLength(2);
  });

  it('fail after a few tries when SES or the network does not answer', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, asked } = ses(
      sesError('InternalFailure', 500, 'Synthetic.'),
      Object.assign(new Error('connect ETIMEDOUT linda@example.com'), { name: 'TimeoutError' }),
      Object.assign(new Error('getaddrinfo ENOTFOUND email.us-east-1.amazonaws.com'), {
        name: 'Error',
      }),
    );
    expect(await sender(client).sent.send(email)).toBe('failed');
    expect(asked).toHaveLength(EMAIL_ATTEMPTS);
    expect(logged.mock.calls.flat().join(' ')).not.toMatch(/linda|amazonaws/);
  });
});

describe('the address Alerts come from', () => {
  it('is the ALERT_EMAIL_FROM setting, or none when it is not set', () => {
    expect(resolveAlertSender(' alerts@example.com ')).toBe('alerts@example.com');
    expect(resolveAlertSender('')).toBeNull();
    expect(resolveAlertSender(undefined)).toBeNull();
  });

  it('fails the deploy when it is not an email address', () => {
    expect(() => resolveAlertSender('alerts')).toThrow(/ALERT_EMAIL_FROM is not an email address/);
  });
});
