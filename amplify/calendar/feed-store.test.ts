import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  NO_ADMIN_MESSENGER,
  createMemoryStore,
  type Actor,
  type Appointment,
} from '../../src/lib/calendar';
import { feedStore, type TableReader } from './feed-store';

const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };
const TABLES = { appointments: 'Appointment-abc', links: 'SubscriptionLink-abc' };

/**
 * Stands in for DynamoDB, holding what the commands wrote (through a calendar kept in memory) the
 * way the data API keeps it, with its own fields beside. Every read it is sent is noted. The hash
 * index can be frozen, as a real index lags behind its table.
 */
async function tables() {
  const memory = createMemoryStore();
  const core = createCalendarCore({
    store: memory,
    clock: createFixedClock('2026-11-19T20:00:00.000Z'),
    messenger: createMemoryMessenger(),
    timeZone: 'America/New_York',
  });
  const sent: { kind: string; input: Record<string, unknown> }[] = [];
  let index: ReturnType<typeof memory.subscriptionLinks> | null = null;
  const kept = (row: object) => ({ ...row, __typename: 'x', createdAt: 'x', updatedAt: 'x' });
  const reader: TableReader = {
    async send(command) {
      const input = command.input as Record<string, unknown>;
      sent.push({ kind: command.constructor.name, input });
      if (command instanceof GetCommand) {
        const { personId } = input.Key as { personId: string };
        const link = memory.subscriptionLinks().find((each) => each.personId === personId);
        return { Item: link && kept(link) };
      }
      if (command instanceof QueryCommand) {
        const hash = (input.ExpressionAttributeValues as Record<string, string>)[':hash'];
        return { Items: (index ?? memory.subscriptionLinks()).filter((l) => l.hash === hash) };
      }
      if (command instanceof ScanCommand) {
        // Two rows to a page, so that reading every row takes more than one.
        const all = memory.appointments().map(kept);
        const from = Number((input.ExclusiveStartKey as { at?: number } | undefined)?.at ?? 0);
        const more = from + 2 < all.length;
        return {
          Items: all.slice(from, from + 2),
          LastEvaluatedKey: more ? { at: from + 2 } : undefined,
        };
      }
      throw new Error(`Not a read: ${sent.at(-1)?.kind}`);
    },
  };
  const feed = createCalendarCore({
    store: feedStore(reader, TABLES),
    clock: createFixedClock('2026-11-19T20:00:00.000Z'),
    messenger: NO_ADMIN_MESSENGER,
    timeZone: 'America/New_York',
  });
  return { core, feed, sent, freezeIndex: () => (index = memory.subscriptionLinks()) };
}

describe('the feed read straight from the tables', () => {
  it('reads every Appointment and the link with strongly consistent reads', async () => {
    const { core, feed, sent } = await tables();
    for (const day of ['20', '21', '22', '23', '24'])
      await core.addAppointment(linda, {
        what: `Visit ${day}`,
        date: `2026-11-${day}`,
        time: '14:00',
      });
    const { secret } = await core.makeSubscriptionLink(linda);
    expect((await feed.subscriptionFeed(secret))?.match(/BEGIN:VEVENT/g)).toHaveLength(5);

    const reads = (kind: string) => sent.filter((each) => each.kind === kind);
    expect(reads('ScanCommand').length).toBeGreaterThan(1);
    for (const { input } of [...reads('ScanCommand'), ...reads('GetCommand')]) {
      expect(input.ConsistentRead).toBe(true);
      expect(Object.values(TABLES)).toContain(input.TableName);
    }
    // The hash index cannot be read consistently; the link it finds is checked in the table.
    expect(reads('QueryCommand')).toMatchObject([
      { input: { TableName: TABLES.links, IndexName: 'subscriptionLinksByHash' } },
    ]);
    expect(reads('GetCommand')).toMatchObject([
      { input: { TableName: TABLES.links, Key: { personId: 'person-linda' } } },
    ]);
  });

  it('shows a change on the very next read', async () => {
    const { core, feed } = await tables();
    const { secret } = await core.makeSubscriptionLink(linda);
    const added = await core.addAppointment(linda, {
      what: 'Visit',
      date: '2026-11-20',
      time: '14:00',
    });
    expect(await feed.subscriptionFeed(secret)).toContain('DTSTART:20261120T190000Z');
    await core.changeAppointment(linda, added.id, { time: '15:30' });
    expect(await feed.subscriptionFeed(secret)).toContain('DTSTART:20261120T203000Z');
    await core.cancelAppointment(linda, added.id);
    expect(await feed.subscriptionFeed(secret)).not.toContain('BEGIN:VEVENT');
  });

  it('stops serving a link switched off or replaced, though the index still holds it', async () => {
    const { core, feed, freezeIndex } = await tables();
    const old = await core.makeSubscriptionLink(linda);
    freezeIndex();
    await core.switchOffSubscriptionLink(linda);
    expect(await feed.subscriptionFeed(old.secret)).toBeNull();
    const replacement = await core.makeSubscriptionLink(linda);
    expect(await feed.subscriptionFeed(old.secret)).toBeNull();
    freezeIndex();
    expect(await feed.subscriptionFeed(replacement.secret)).toContain('BEGIN:VCALENDAR');
  });

  it('hands back an Appointment as the core made it, without the data API fields', async () => {
    const { core } = await tables();
    const added: Appointment = await core.addAppointment(linda, {
      what: 'Visit',
      date: '2026-11-20',
      time: '14:00',
    });
    const reader: TableReader = {
      send: async () => ({ Items: [{ ...added, __typename: 'Appointment', createdAt: 'x' }] }),
    };
    expect(await feedStore(reader, TABLES).everyAppointment()).toEqual([added]);
  });

  it('never writes', async () => {
    const store = feedStore({ send: async () => ({}) }, TABLES);
    await expect(store.removeSubscriptionLink('person-linda')).rejects.toThrow(/only reads/);
    await expect(store.recordActivity({} as never)).rejects.toThrow(/only reads/);
  });
});
