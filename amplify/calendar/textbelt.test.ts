import { describe, expect, it } from 'vitest';
import { failureKind } from '../../src/lib/failure';
import { TEXTBELT_STATUSES, textbeltSender } from './textbelt';

// Textbelt's answers as its documentation records them (docs.textbelt.com and textbelt.com, read
// on 20 November 2026; docs/text-message-setup.md). No request here reaches Textbelt: each test
// hands the sender a stand-in for `fetch` that answers with one of these.
const RECORDED = {
  sent: { success: true, quotaRemaining: 40, textId: 12345 },
  outOfQuota: { success: false, quotaRemaining: 0, error: 'Out of quota' },
  incomplete: { success: false, error: 'Incomplete request' },
  status: (status: string) => ({ status }),
};

/** An invented number (555-01xx belongs to nobody) and key, and words like a Reminder's. */
const TO = '+15555550123';
const KEY = 'invented-key-0000';
const WORDS = "Susan's Calendar: Cardiology check-up with Dr. Patel, tomorrow at 2:00 pm.";

interface Asked {
  url: string;
  method: string;
  body: URLSearchParams | null;
}

/** A stand-in for `fetch` that answers each request with the next answer, and keeps what it was asked. */
function textbelt(...answers: (unknown | Error | { status: number; body: string })[]) {
  const asked: Asked[] = [];
  const request = async (url: string | URL | Request, init?: RequestInit) => {
    asked.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body instanceof URLSearchParams ? init.body : null,
    });
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    if (answer && typeof answer === 'object' && 'status' in answer && 'body' in answer)
      return new Response((answer as { body: string }).body, {
        status: (answer as { status: number }).status,
      });
    return Response.json(answer);
  };
  const sender = textbeltSender({ key: KEY, fetch: request as typeof fetch });
  return { sender, asked };
}

/** What the sender threw, checked to hold nothing it was sent. */
async function thrown(call: Promise<unknown>) {
  const error = await call.then(
    () => null,
    (caught: unknown) => caught as Error,
  );
  expect(error).toBeInstanceOf(Error);
  const said = `${error?.message} ${error?.stack} ${String(error?.cause ?? '')}`;
  expect(said).not.toMatch(/5555550123|Cardiology|invented-key/);
  return error!;
}

describe('the Textbelt sender', () => {
  it("sends the words to Susan's number with the key, as one form-encoded request", async () => {
    const { sender, asked } = textbelt(RECORDED.sent);
    await sender.send({ to: TO, words: WORDS });
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toBe('https://textbelt.com/text');
    expect(asked[0].method).toBe('POST');
    expect(Object.fromEntries(asked[0].body ?? [])).toEqual({
      phone: '5555550123',
      message: WORDS,
      key: KEY,
    });
  });

  it('answers a send Textbelt took with its textId and the credit left', async () => {
    const { sender } = textbelt(RECORDED.sent);
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({
      sent: true,
      reference: '12345',
      creditLeft: 40,
    });
  });

  it('answers a send Textbelt refused, "Out of quota", as refused, with the credit left', async () => {
    const { sender } = textbelt(RECORDED.outOfQuota);
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({ sent: false, creditLeft: 0 });
  });

  it('answers any other refusal as refused, saying nothing of credit it was not told', async () => {
    const { sender } = textbelt(RECORDED.incomplete, { status: 400, body: '{"success":false}' });
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({ sent: false, creditLeft: null });
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({ sent: false, creditLeft: null });
  });

  it('refuses, without asking Textbelt, a number that is not a US one', async () => {
    const { sender, asked } = textbelt();
    expect(await sender.send({ to: '+442079460958', words: WORDS })).toEqual({ sent: false });
    expect(asked).toEqual([]);
  });

  it('throws, so the text is tried again, when nobody can tell whether it went', async () => {
    const timedOut = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    const dropped = new TypeError('fetch failed');
    const { sender } = textbelt(
      timedOut,
      dropped,
      { status: 502, body: 'Bad gateway' },
      { status: 200, body: 'not JSON' },
      { status: 200, body: '{"quotaRemaining": 3}' },
    );
    const kinds = [];
    for (let n = 0; n < 5; n += 1)
      kinds.push(failureKind(await thrown(sender.send({ to: TO, words: WORDS }))));
    expect(kinds).toEqual(['timeout', 'network', 'unknown', 'unknown', 'unknown']);
  });

  it('puts neither the number, the words nor the key in what it throws', async () => {
    const leak = new Error(`Could not POST phone=5555550123&message=${WORDS}&key=${KEY}`);
    const { sender } = textbelt(leak);
    const error = await thrown(sender.send({ to: TO, words: WORDS }));
    expect(error).not.toBe(leak);
    expect(error.cause).toBeUndefined();
  });
});

describe("Textbelt's delivery statuses", () => {
  it('are mapped to the calendar in one place: DELIVERED, FAILED, and the rest still sent', () => {
    expect(TEXTBELT_STATUSES).toEqual({
      DELIVERED: 'delivered',
      FAILED: 'failed',
      SENDING: 'pending',
      SENT: 'pending',
      UNKNOWN: 'pending',
    });
  });

  it('are asked for by textId, with no key', async () => {
    const { sender, asked } = textbelt(RECORDED.status('DELIVERED'));
    await sender.delivery('12345');
    expect(asked).toEqual([
      { url: 'https://textbelt.com/status/12345', method: 'GET', body: null },
    ]);
  });

  it.each([
    ['DELIVERED', 'delivered'],
    ['FAILED', 'failed'],
    ['SENDING', 'pending'],
    ['SENT', 'pending'],
    ['UNKNOWN', 'pending'],
    // A status the documentation does not list settles nothing.
    ['QUEUED', 'pending'],
    ['toString', 'pending'],
  ])('answer %s as %s', async (status, report) => {
    const { sender } = textbelt(RECORDED.status(status));
    expect(await sender.delivery('12345')).toBe(report);
  });

  it('throw, so the next run asks again, when Textbelt cannot be asked', async () => {
    const { sender } = textbelt(
      new TypeError('fetch failed'),
      { status: 503, body: 'Unavailable' },
      { status: 200, body: '{}' },
    );
    for (let n = 0; n < 3; n += 1) await thrown(sender.delivery('12345'));
  });
});
