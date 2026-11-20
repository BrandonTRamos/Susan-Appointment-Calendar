// Agent keys: what a person gives their AI agent so that it can read and change the calendar
// through the MCP server, as them. Only a hash of each is kept, so a key is seen in full only when
// it is made. The randomness and the hashing are the subscription link's (subscription.ts).

import { newSubscriptionSecret, subscriptionHash } from './subscription';

/** A person's agent key, as it is kept: never the key itself. */
export interface AgentKey {
  /** The SHA-256 hash of the key, in hex. It is also how the person names the key to revoke it. */
  hash: string;
  /** Whose key it is. A person can have several. */
  personId: string;
  /** What the person called it, to tell their keys apart: "Claude on my laptop". */
  name: string;
  /** When it was made, as an ISO timestamp. */
  madeAt: string;
}

/** A key just made: the key itself, which is shown this once and never kept, and what is kept. */
export interface MadeAgentKey extends Omit<AgentKey, 'personId'> {
  key: string;
}

/** Every key starts so, so that it can be told apart from other secrets where it is pasted. */
export const AGENT_KEY_PREFIX = 'sc_agent_';

/** The longest name a key can have. */
export const AGENT_KEY_NAME_LIMIT = 60;

/** What a key looks like: the prefix, then 32 random bytes in base64url without padding. */
const KEY = /^sc_agent_[A-Za-z0-9_-]{43}$/;

export function isAgentKey(value: unknown): value is string {
  return typeof value === 'string' && KEY.test(value);
}

/** A new key: 256 random bits, too many to guess. */
export function newAgentKey(): string {
  return AGENT_KEY_PREFIX + newSubscriptionSecret();
}

/** What is kept in place of a key. */
export const agentKeyHash = (key: string): Promise<string> => subscriptionHash(key);
