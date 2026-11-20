import type { GetCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  createMemoryStore,
  createStandInSender,
  type Actor,
} from '../../src/lib/calendar';
import { tableAgentKeys } from './agent-key-table';

const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };

/**
 * A calendar whose keys are made and revoked through the core, with the MCP server's finder over a
 * stand-in for DynamoDB that holds them as the data API keeps them, and notes every read.
 */
function calendar() {
  const memory = createMemoryStore();
  const reads: GetCommand['input'][] = [];
  const findKey = tableAgentKeys(
    {
      async send(command) {
        reads.push(command.input);
        const found = memory.agentKeys().find((key) => key.hash === command.input.Key?.hash);
        return { Item: found && { ...found, __typename: 'AgentKey', createdAt: 'x' } };
      },
    },
    'AgentKey-abc',
  );
  const core = createCalendarCore({
    store: { ...memory, agentKeyByHash: findKey },
    clock: createFixedClock('2026-11-19T20:00:00.000Z'),
    messenger: createMemoryMessenger(),
    textSender: createStandInSender(),
    timeZone: 'America/New_York',
  });
  return { core, reads };
}

describe('the MCP server finding an agent key', () => {
  it('reads the key by its hash from the table, with a strongly consistent read', async () => {
    const { core, reads } = calendar();
    const { key, hash } = await core.makeAgentKey(linda, 'Laptop');
    expect(await core.agentKeyOwner(key)).toBe('person-linda');
    expect(reads).toEqual([{ TableName: 'AgentKey-abc', Key: { hash }, ConsistentRead: true }]);
  });

  it('refuses a key from the moment it is revoked', async () => {
    const { core } = calendar();
    const { key, hash } = await core.makeAgentKey(linda, 'Laptop');
    await core.revokeAgentKey(linda, hash);
    expect(await core.agentKeyOwner(key)).toBeNull();
  });

  it('reads nothing for what cannot be a key', async () => {
    const { core, reads } = calendar();
    expect(await core.agentKeyOwner('not a key')).toBeNull();
    expect(reads).toEqual([]);
  });
});
