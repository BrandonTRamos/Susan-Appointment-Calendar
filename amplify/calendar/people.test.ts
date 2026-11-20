import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it, vi } from 'vitest';
import { rememberedNames, userPoolNames } from './people';

/** A user pool with these accounts, each as its attributes. */
function userPool(accounts: Record<string, { Name: string; Value: string }[]>) {
  const send = vi.fn(async (command: { input: { UserPoolId?: string; Username?: string } }) => ({
    UserAttributes: accounts[command.input.Username ?? ''],
  }));
  return { send, client: { send } as unknown as CognitoIdentityProviderClient };
}

describe("an account's name", () => {
  it('is its name attribute in the user pool', async () => {
    const { send, client } = userPool({
      'account-linda': [
        { Name: 'email', Value: 'linda@example.com' },
        { Name: 'name', Value: 'Linda' },
      ],
    });
    const nameOf = userPoolNames('pool-1', client);
    expect(await nameOf('account-linda')).toBe('Linda');
    expect(send.mock.calls[0][0].input).toEqual({
      UserPoolId: 'pool-1',
      Username: 'account-linda',
    });
  });

  it('is nothing when the account has no name: never its email address', async () => {
    const { client } = userPool({
      'account-linda': [{ Name: 'email', Value: 'linda@example.com' }],
    });
    expect(await userPoolNames('pool-1', client)('account-linda')).toBeNull();
  });

  it('is remembered for a few minutes, then asked for again', async () => {
    let name = 'Linda';
    let now = 0;
    const find = vi.fn(async () => name);
    const nameOf = rememberedNames(find, () => now);
    expect(await nameOf('account-linda')).toBe('Linda');
    name = 'Linda R.';
    now = 4 * 60_000;
    expect(await nameOf('account-linda')).toBe('Linda');
    expect(find).toHaveBeenCalledTimes(1);
    now = 6 * 60_000;
    expect(await nameOf('account-linda')).toBe('Linda R.');
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('is not remembered when the lookup fails', async () => {
    const find = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('Linda');
    const nameOf = rememberedNames(find);
    await expect(nameOf('account-linda')).rejects.toThrow('offline');
    expect(await nameOf('account-linda')).toBe('Linda');
  });
});
