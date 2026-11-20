// Calendar subscription links: each person's secret address for seeing Susan's Appointments in
// their own calendar app. Only a hash of each is kept, so a link is seen in full only when it is
// made. Web Crypto, which the browser and Node 22 both have, does the randomness and the hashing.

/** A person's subscription link, as it is kept: never the link itself. */
export interface SubscriptionLink {
  /** Whose link it is. Each person has at most one. */
  personId: string;
  /** The SHA-256 hash of the link's secret, in hex. */
  hash: string;
  /** When it was made, as an ISO timestamp. */
  madeAt: string;
}

/** A link just made: the secret, which is shown this once and never kept, and when it was made. */
export interface MadeSubscriptionLink {
  secret: string;
  madeAt: string;
}

/** What a secret looks like: 32 random bytes, written in base64url without padding. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;

export function isSubscriptionSecret(value: unknown): value is string {
  return typeof value === 'string' && SECRET.test(value);
}

/** A new secret: 256 random bits, too many to guess. */
export function newSubscriptionSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** What is kept in place of a secret. */
export async function subscriptionHash(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The address a person pastes into their calendar app: the feed's address with their secret. */
export function subscriptionAddress(feedUrl: string, secret: string): string {
  return `${feedUrl.replace(/\/*$/, '/')}${secret}`;
}
