// The name the calendar calls each account by: the `name` attribute the owner fills in when
// creating the account (README, "Accounts"). The data API tells a function who is calling but not
// their name, so it is looked up in the user pool.

import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

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
