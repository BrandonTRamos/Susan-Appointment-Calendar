import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  createMemoryStore,
  type Actor,
  createStandInSender,
} from '../../../src/lib/calendar';
import { subscriptionFeedHandler } from './feed';

const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };

/** The feed as a calendar app reaches it, over a sample calendar kept in memory. */
async function feed() {
  const store = createMemoryStore();
  const core = createCalendarCore({
    store,
    clock: createFixedClock('2026-11-19T20:00:00.000Z'),
    messenger: createMemoryMessenger(),
    textSender: createStandInSender(),
    timeZone: 'America/New_York',
  });
  await core.addAppointment(linda, {
    what: 'Cardiology check-up',
    date: '2026-11-20',
    time: '14:00',
    privateNotes: 'Ask about the new prescription.',
  });
  const handler = subscriptionFeedHandler({ core: async () => core });
  /** Asks for an address the way a Lambda function URL hands the request over. */
  const get = (path: string, method = 'GET') =>
    handler({
      rawPath: path,
      requestContext: { http: { method } },
    } as unknown as LambdaFunctionURLEvent);
  return { core, get };
}

afterEach(() => vi.restoreAllMocks());

describe('the subscription feed, as a calendar app asks for it', () => {
  it('answers a working link with the calendar, never kept by anything on the way', async () => {
    const { core, get } = await feed();
    const { secret } = await core.makeSubscriptionLink(linda);
    const answer = await get(`/${secret}`);
    expect(answer.statusCode).toBe(200);
    expect(answer.headers).toMatchObject({
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'no-store',
    });
    expect(answer.body).toContain('SUMMARY:Cardiology check-up');
    expect(answer.body).not.toContain('prescription');
  });

  it('gives the same answer for a link switched off as for one that never was', async () => {
    const { core, get } = await feed();
    const { secret } = await core.makeSubscriptionLink(linda);
    await core.switchOffSubscriptionLink(linda);
    const off = await get(`/${secret}`);
    expect(off.statusCode).toBe(404);
    expect(off.body).not.toContain('VCALENDAR');
    const unknown = await get(`/${'A'.repeat(43)}`);
    for (const other of [unknown, await get('/'), await get('/favicon.ico'), await get('')])
      expect(other).toEqual(off);
  });

  it('answers HEAD without the calendar, and refuses anything but reading', async () => {
    const { core, get } = await feed();
    const { secret } = await core.makeSubscriptionLink(linda);
    expect(await get(`/${secret}`, 'HEAD')).toMatchObject({ statusCode: 200, body: '' });
    for (const method of ['POST', 'PUT', 'DELETE'])
      expect(await get(`/${secret}`, method)).toMatchObject({
        statusCode: 405,
        headers: { allow: 'GET, HEAD' },
      });
  });

  it('a failure says nothing about the link, and logs nothing of it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = subscriptionFeedHandler({
      core: async () => {
        throw new Error('The data API is not answering');
      },
    });
    const secret = 'S'.repeat(43);
    const answer = await handler({
      rawPath: `/${secret}`,
      requestContext: { http: { method: 'GET' } },
    } as unknown as LambdaFunctionURLEvent);
    expect(answer.statusCode).toBe(503);
    expect(answer.body).not.toContain(secret);
    const words = logged.mock.calls.flat().join(' ');
    expect(words).toContain('The data API is not answering');
    expect(words).not.toContain(secret);
  });
});
