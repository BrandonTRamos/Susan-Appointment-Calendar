// The name the calendar calls each account by: the `name` attribute the owner fills in when
// creating the account (README, "Accounts"). The data API tells a function who is calling but not
// their name, so it is looked up in the user pool.

import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

/** Shown when the account has no usable name. The owner gives every account one. */
const NO_NAME = 'Someone';

/** The name the calendar calls a person by: their account's, tidied, or "Someone" without one. */
export function displayName(name: string | null | undefined): string {
  return name?.trim().replace(/\s+/g, ' ').slice(0, 80) || NO_NAME;
}

/** A name is asked for again after this long, so that a corrected one shows within minutes. */
const REMEMBER_FOR_MS = 5 * 60_000;

/** Finds an account's `name` attribute by its username. Null when it has none. */
export type FindName = (username: string) => Promise<string | null>;

/** Asks the user pool. */
export function userPoolNames(
  userPoolId: string,
  client = new CognitoIdentityProviderClient({}),
): FindName {
  return async (username) => {
    const user = await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: username }),
    );
    return user.UserAttributes?.find((attribute) => attribute.Name === 'name')?.Value ?? null;
  };
}

/** Remembers each name for a few minutes, so that most commands need no lookup. */
export function rememberedNames(find: FindName, now: () => number = Date.now): FindName {
  const remembered = new Map<string, { name: string | null; until: number }>();
  return async (username) => {
    const known = remembered.get(username);
    if (known && known.until > now()) return known.name;
    const name = await find(username);
    remembered.set(username, { name, until: now() + REMEMBER_FOR_MS });
    return name;
  };
}

/** An account as the MCP server needs it: its name, and whether the owner has disabled it. */
export interface PersonAccount {
  name: string | null;
  enabled: boolean;
}

/**
 * Finds an account by its person ID, the account's `sub`, which the user pool accepts in place of
 * its username. Null when there is no such account any more. Asked afresh every time, so that an
 * account the owner disables or deletes stops its agent's key at once.
 */
export function userPoolAccounts(
  userPoolId: string,
  client = new CognitoIdentityProviderClient({}),
): (personId: string) => Promise<PersonAccount | null> {
  return async (personId) => {
    try {
      const user = await client.send(
        new AdminGetUserCommand({ UserPoolId: userPoolId, Username: personId }),
      );
      const name =
        user.UserAttributes?.find((attribute) => attribute.Name === 'name')?.Value ?? null;
      // Only an answer that says the account is enabled lets its agent act: one that does not say
      // counts as disabled.
      return { name, enabled: user.Enabled === true };
    } catch (error) {
      if ((error as { name?: string }).name === 'UserNotFoundException') return null;
      throw error;
    }
  };
}
