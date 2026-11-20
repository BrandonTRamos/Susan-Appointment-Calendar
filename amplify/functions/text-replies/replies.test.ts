import { createHmac } from 'node:crypto';
import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  createMemoryStore,
  createStandInSender,
  type Actor,
  type CalendarCore,
} from '../../../src/lib/calendar';
import { textRepliesHandler } from './replies';

const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };
/** Invented: a key, and numbers in 555-01xx, which belong to nobody. */
const KEY = 'invented-key-0000';
const SUSANS_NUMBER = '+15555550123';
const NOW = '2026-11-19T20:02:00.000Z';
const WORDS = "I can't go, I'm not well";

/** The reply address as Textbelt reaches it, over a calendar kept in memory. */
async function replyAddress({ key = KEY as string | null } = {}) {
  const store = createMemoryStore();
  const clock = createFixedClock(NOW);
  const messenger = createMemoryMessenger(['person-linda', 'person-mark']);
  const sender = createStandInSender();
  const core = createCalendarCore({
    store,
    clock,
    messenger,
    textSender: sender,
    timeZone: 'America/New_York',
  });
  await core.changeSettings(linda, {
    susansNumber: SUSANS_NUMBER,
    contactName: 'Linda',
    contactPhone: '+15555550187',
  });
  const handler = textRepliesHandler({ core: async () => core, key: () => key, clock });
  return { store, clock, messenger, sender, core, handler };
}

/** A request as a Lambda function URL hands it over, signed as Textbelt signs a Reply. */
function request({
  text = WORDS,
  at = NOW,
  signWith = KEY,
  method = 'POST',
  base64 = false,
}: { text?: string; at?: string; signWith?: string; method?: string; base64?: boolean } = {}) {
  const body = JSON.stringify({ textId: '12345', fromNumber: SUSANS_NUMBER, text });
  const timestamp = String(Math.floor(Date.parse(at) / 1000));
  const signature = createHmac('sha256', signWith)
    .update(timestamp + body)
    .digest('hex');
  return {
    rawPath: '/',
    headers: { 'x-textbelt-signature': signature, 'x-textbelt-timestamp': timestamp },
    body: base64 ? Buffer.from(body).toString('base64') : body,
    isBase64Encoded: base64,
    requestContext: { http: { method } },
  } as unknown as LambdaFunctionURLEvent;
}

/** Everything logged, as one string, to check it holds nothing it should not. */
function logs() {
  const spies = [
    vi.spyOn(console, 'log').mockImplementation(() => {}),
    vi.spyOn(console, 'warn').mockImplementation(() => {}),
    vi.spyOn(console, 'error').mockImplementation(() => {}),
  ];
  return () => spies.flatMap((spy) => spy.mock.calls.flat()).join(' ');
}

afterEach(() => vi.restoreAllMocks());

describe('the reply address', () => {
  it('keeps a Reply Textbelt signed, and the next run passes it on and answers her', async () => {
    const { handler, store, core, messenger, sender } = await replyAddress();
    const answer = await handler(request());
    expect(answer.statusCode).toBe(200);
    expect(store.replies()).toMatchObject([{ words: WORDS, fromSusan: true, receivedAt: NOW }]);
    await core.runDue();
    expect(
      messenger
        .emails()
        .map(({ to }) => to)
        .flat(),
    ).toEqual(['person-linda', 'person-mark']);
    expect(messenger.emails()[0].email.body).toContain(`"${WORDS}"`);
    expect(sender.taken()).toEqual([
      {
        to: SUSANS_NUMBER,
        words:
          "Susan's Calendar: Texts to this number are not answered. If you need anything, please call Linda at (555) 555-0187.",
      },
    ]);
  });

  it('keeps the same request once, however many times it arrives', async () => {
    const { handler, store } = await replyAddress();
    const once = request();
    await handler(once);
    await handler(once);
    expect(store.replies()).toHaveLength(1);
  });

  it('reads a body the function URL hands over base64-encoded', async () => {
    const { handler, store } = await replyAddress();
    expect((await handler(request({ base64: true }))).statusCode).toBe(200);
    expect(store.replies()[0].words).toBe(WORDS);
  });

  it('rejects a forged request, keeps nothing, and logs only why', async () => {
    const logged = logs();
    const { handler, store } = await replyAddress();
    const answer = await handler(request({ signWith: 'someone-elses-key' }));
    expect(answer.statusCode).toBe(401);
    expect(answer.body).toBe('Not accepted.\n');
    expect(store.replies()).toEqual([]);
    expect(logged()).toBe('Reply refused (forged)');
  });

  it('rejects a request whose timestamp is more than 15 minutes old', async () => {
    const logged = logs();
    const { handler, store } = await replyAddress();
    const answer = await handler(request({ at: '2026-11-19T19:46:00.000Z' }));
    expect(answer.statusCode).toBe(401);
    expect(store.replies()).toEqual([]);
    expect(logged()).toBe('Reply refused (stale)');
  });

  it('rejects anything that is not a signed POST', async () => {
    logs();
    const { handler, store } = await replyAddress();
    expect((await handler(request({ method: 'GET' }))).statusCode).toBe(405);
    const unsigned = { ...request(), headers: {} } as unknown as LambdaFunctionURLEvent;
    expect((await handler(unsigned)).statusCode).toBe(401);
    expect(store.replies()).toEqual([]);
  });

  it('takes nothing while no Textbelt key is stored, since nothing can be checked', async () => {
    const logged = logs();
    const { handler, store } = await replyAddress({ key: null });
    expect((await handler(request())).statusCode).toBe(503);
    expect(store.replies()).toEqual([]);
    expect(logged()).toBe('Reply refused (no key stored)');
  });

  it('asks to be tried again when the Reply cannot be kept, with nothing of it in the log or answer', async () => {
    const logged = logs();
    const leak = new Error(`Could not write ${WORDS} from ${SUSANS_NUMBER}`);
    const handler = textRepliesHandler({
      core: async () =>
        ({
          receiveReply: async () => {
            throw leak;
          },
        }) as unknown as CalendarCore,
      key: () => KEY,
      clock: createFixedClock(NOW),
    });
    const answer = await handler(request());
    expect(answer.statusCode).toBe(503);
    expect(`${answer.body} ${logged()}`).not.toMatch(/not well|5555550123|invented-key/);
    expect(logged()).toBe('Reply failed (unknown)');
  });
});
