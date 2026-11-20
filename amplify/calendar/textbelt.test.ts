import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { failureKind } from '../../src/lib/failure';
import {
  readTextbeltReply,
  TEXTBELT_OPTED_OUT_ERRORS,
  TEXTBELT_STATUSES,
  textbeltSender,
  type TextbeltOptions,
} from './textbelt';

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

type Answer = unknown | Error | { status: number; body: string };

/** A stand-in for `fetch` that answers each request with the next answer, and keeps what it was asked. */
function textbelt(...answers: Answer[]) {
  return textbeltWith({}, ...answers);
}

function textbeltWith(options: Partial<TextbeltOptions>, ...answers: Answer[]) {
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
  const sender = textbeltSender({ key: KEY, ...options, fetch: request as typeof fetch });
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

  it('answers a refusal as refused whatever the HTTP status, out of credit included', async () => {
    const { sender } = textbelt(
      { status: 402, body: JSON.stringify(RECORDED.outOfQuota) },
      { status: 500, body: JSON.stringify(RECORDED.outOfQuota) },
      { status: 503, body: JSON.stringify(RECORDED.incomplete) },
    );
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({ sent: false, creditLeft: 0 });
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({ sent: false, creditLeft: 0 });
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({ sent: false, creditLeft: null });
  });

  it("throws on a gateway's answer that is not Textbelt's, so the text is tried again", async () => {
    const { sender } = textbelt(
      { status: 502, body: '<html>Bad gateway</html>' },
      { status: 503, body: '{"message": "Service Unavailable"}' },
      { status: 504, body: '' },
    );
    for (let n = 0; n < 3; n += 1) await thrown(sender.send({ to: TO, words: WORDS }));
  });

  it('answers any other refusal as refused, saying nothing of credit it was not told', async () => {
    const { sender } = textbelt(RECORDED.incomplete, { status: 400, body: '{"success":false}' });
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({ sent: false, creditLeft: null });
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({ sent: false, creditLeft: null });
  });

  it("names the calendar's reply address in every text, as a field and not in the words", async () => {
    const replyTo = 'https://replies.example.com/';
    const { sender, asked } = textbeltWith({ replyTo }, RECORDED.sent);
    await sender.send({ to: TO, words: WORDS });
    expect(Object.fromEntries(asked[0].body ?? [])).toEqual({
      phone: '5555550123',
      message: WORDS,
      key: KEY,
      replyWebhookUrl: replyTo,
    });
  });

  it('takes no refusal as texts being blocked while Textbelt documents none', async () => {
    // Textbelt does not say what a send to a number that opted out returns (ticket 17). Until the
    // owner's check finds out, every refusal is an ordinary one, these invented words included.
    expect(TEXTBELT_OPTED_OUT_ERRORS).toEqual([]);
    const { sender } = textbelt({ success: false, error: 'Invented: recipient opted out' });
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({ sent: false, creditLeft: null });
  });

  it('answers a refusal whose words are listed as opted out as blocked, and no other', async () => {
    const optedOutErrors = ['Invented: recipient opted out'];
    const { sender } = textbeltWith(
      { optedOutErrors },
      { success: false, quotaRemaining: 30, error: 'Invented: recipient opted out' },
      RECORDED.outOfQuota,
      { success: false, error: 'invented: recipient opted out, said differently' },
    );
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({
      sent: false,
      blocked: true,
      creditLeft: 30,
    });
    expect(await sender.send({ to: TO, words: WORDS })).toEqual({ sent: false, creditLeft: 0 });
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

  it('give up waiting for a slow answer, so the next run asks again', async () => {
    // A request that never answers, until it is told it has waited too long.
    const request = (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
      );
    const sender = textbeltSender({
      key: KEY,
      fetch: request as typeof fetch,
      statusTimeoutMs: 20,
    });
    const error = await thrown(sender.delivery('12345'));
    expect(failureKind(error)).toBe('timeout');
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

describe('Replies from Textbelt', () => {
  /** When the requests below are read: 19 November 2026, 3:02 pm in New York. */
  const NOW = new Date('2026-11-19T20:02:00.000Z');
  const seconds = (at: Date) => String(Math.floor(at.getTime() / 1000));
  /**
   * A Reply as Textbelt's documentation shows one, with an invented number, signed as Textbelt
   * signs it: the hex HMAC-SHA256, keyed with the key, of the timestamp followed by the raw body.
   */
  function signed({
    text = "I can't go, I'm not well",
    at = NOW,
    key = KEY,
    body,
  }: { text?: string; at?: Date; key?: string; body?: string } = {}) {
    const raw = body ?? JSON.stringify({ textId: '12345', fromNumber: '+15555550123', text });
    const timestamp = seconds(at);
    const signature = createHmac('sha256', key)
      .update(timestamp + raw)
      .digest('hex');
    return {
      headers: { 'x-textbelt-signature': signature, 'x-textbelt-timestamp': timestamp },
      body: raw,
      now: NOW,
    };
  }

  it('are read from a request Textbelt signed with the key: its words and the number it came from', () => {
    const read = readTextbeltReply(KEY, signed());
    expect(read).toEqual({
      reply: {
        key: expect.stringMatching(/^[0-9a-f]{40}$/),
        words: "I can't go, I'm not well",
        from: '+15555550123',
      },
    });
  });

  it('are read whatever case the headers come in', () => {
    const request = signed();
    const headers = {
      'X-Textbelt-Signature': request.headers['x-textbelt-signature'],
      'X-TEXTBELT-TIMESTAMP': request.headers['x-textbelt-timestamp'],
    };
    expect(readTextbeltReply(KEY, { ...request, headers })).toHaveProperty('reply');
  });

  it('are told apart by their signature, so the same request twice is the same Reply', () => {
    const once = readTextbeltReply(KEY, signed()) as { reply: { key: string } };
    const again = readTextbeltReply(KEY, signed()) as { reply: { key: string } };
    const later = readTextbeltReply(KEY, signed({ at: new Date(NOW.getTime() - 60_000) })) as {
      reply: { key: string };
    };
    expect(again.reply.key).toBe(once.reply.key);
    expect(later.reply.key).not.toBe(once.reply.key);
  });

  it('reject a forged request: signed with another key, or changed after signing', () => {
    expect(readTextbeltReply(KEY, signed({ key: 'some-other-key' }))).toEqual({
      rejected: 'forged',
    });
    const request = signed();
    const changed = { ...request, body: request.body.replace('not well', 'fine') };
    expect(readTextbeltReply(KEY, changed)).toEqual({ rejected: 'forged' });
    const moved = {
      ...request,
      headers: {
        ...request.headers,
        'x-textbelt-timestamp': seconds(new Date(NOW.getTime() - 1000)),
      },
    };
    expect(readTextbeltReply(KEY, moved)).toEqual({ rejected: 'forged' });
  });

  it("reject a request with no signature or timestamp, or one not in Textbelt's form", () => {
    const { headers, body, now } = signed();
    const signature = headers['x-textbelt-signature'];
    const timestamp = headers['x-textbelt-timestamp'];
    for (const each of [
      {},
      { 'x-textbelt-signature': signature },
      { 'x-textbelt-timestamp': timestamp },
      { 'x-textbelt-signature': 'not-hex', 'x-textbelt-timestamp': timestamp },
      { 'x-textbelt-signature': signature.slice(2), 'x-textbelt-timestamp': timestamp },
      { 'x-textbelt-signature': signature, 'x-textbelt-timestamp': '2026-11-19T20:02:00Z' },
    ])
      expect(readTextbeltReply(KEY, { headers: each, body, now })).toEqual({
        rejected: 'unsigned',
      });
    // With no key stored, nothing can be checked, so nothing is taken.
    expect(readTextbeltReply('', signed())).toEqual({ rejected: 'unsigned' });
  });

  it('reject a request whose timestamp is more than 15 minutes from now, either way', () => {
    const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
    expect(readTextbeltReply(KEY, signed({ at: minutes(-16) }))).toEqual({ rejected: 'stale' });
    expect(readTextbeltReply(KEY, signed({ at: minutes(16) }))).toEqual({ rejected: 'stale' });
    expect(readTextbeltReply(KEY, signed({ at: minutes(-14) }))).toHaveProperty('reply');
    expect(readTextbeltReply(KEY, signed({ at: minutes(-15) }))).toHaveProperty('reply');
  });

  it('reject a signed request that is not a Reply', () => {
    for (const body of ['not JSON', '[]', 'null', '{"textId":"1","fromNumber":"+15555550123"}'])
      expect(readTextbeltReply(KEY, signed({ body }))).toEqual({ rejected: 'unreadable' });
  });

  it('reject a request far larger than any Reply, before reading it', () => {
    expect(readTextbeltReply(KEY, signed({ text: 'a'.repeat(20_000) }))).toEqual({
      rejected: 'forged',
    });
  });

  // Textbelt documents that it handles STOP and START itself, and not whether either, or HELP,
  // also reaches the reply address (ticket 17). If one does, it is a Reply like any other: its
  // words are kept and passed on, never read for meaning.
  it.each(['STOP', 'stop', 'START', 'HELP', 'UNSUBSCRIBE'])(
    'read %s, if it arrives, as an ordinary Reply',
    (text) => {
      expect(readTextbeltReply(KEY, signed({ text }))).toMatchObject({ reply: { words: text } });
    },
  );

  it('keep the custom data Textbelt may add beside the Reply out of what is read', () => {
    const body = JSON.stringify({
      textId: '12345',
      fromNumber: '+15555550123',
      text: 'On my way',
      data: 'invented custom data',
    });
    expect(readTextbeltReply(KEY, signed({ body }))).toEqual({
      reply: { key: expect.any(String), words: 'On my way', from: '+15555550123' },
    });
  });
});
