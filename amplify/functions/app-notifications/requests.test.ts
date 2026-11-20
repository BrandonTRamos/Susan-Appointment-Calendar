import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Devices, Subscription } from '../../calendar/app-notification-devices';
import { appNotificationsHandler, DEVICE_FAILED, type DeviceEvent } from './requests';

const linda = { sub: 'person-linda', username: 'account-linda' };
const phone = {
  endpoint: 'https://web.push.apple.com/QGxpbmRhcy1waG9uZQ',
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XLjjpLQ',
  auth: 'tBHItJI5svbpez7KI4CCXg',
  label: 'iPhone',
};

/** Devices kept in memory, with each call to them noted. */
function devices() {
  const saved: { personId: string; subscription: Subscription }[] = [];
  const forgotten: { personId: string; endpoint: string }[] = [];
  const kept: Devices = {
    publicKey: async () => 'the-public-key',
    keys: async () => null,
    save: async (personId, subscription) => void saved.push({ personId, subscription }),
    forget: async (personId, endpoint) => void forgotten.push({ personId, endpoint }),
    forgetById: async () => {},
    of: async () => [],
  };
  const handler = appNotificationsHandler({ devices: async () => kept });
  const call = (fieldName: string, args: Record<string, unknown> = {}, identity: unknown = linda) =>
    handler({ fieldName, arguments: args, identity } as DeviceEvent);
  return { saved, forgotten, call };
}

afterEach(() => vi.restoreAllMocks());

describe('turning app notifications on and off for a device', () => {
  it('hands out the public key a device subscribes with', async () => {
    expect(await devices().call('appNotificationKey')).toBe('the-public-key');
  });

  it("keeps the device against the signed-in person's account, whatever the device says", async () => {
    const { saved, call } = devices();
    expect(
      await call('turnOnAppNotifications', { ...phone, personId: 'person-mark', sub: 'x' }),
    ).toBe(true);
    expect(saved).toEqual([{ personId: 'person-linda', subscription: phone }]);
  });

  it("forgets the device by its endpoint, as the signed-in person's own", async () => {
    const { forgotten, call } = devices();
    expect(
      await call('turnOffAppNotifications', { endpoint: phone.endpoint, personId: 'person-mark' }),
    ).toBe(true);
    expect(forgotten).toEqual([{ personId: 'person-linda', endpoint: phone.endpoint }]);
  });

  it('takes the push services browsers use', async () => {
    const { saved, call } = devices();
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
      'https://web.push.apple.com/abc',
    ])
      await call('turnOnAppNotifications', { ...phone, endpoint });
    expect(saved).toHaveLength(4);
  });

  it.each([
    ['an address that is not a push service', { endpoint: 'https://example.com/push' }],
    ['an address that is not https', { endpoint: 'http://web.push.apple.com/abc' }],
    ['no address', { endpoint: undefined }],
    ['keys that are not keys', { p256dh: 'not a key!' }],
  ])('refuses %s', async (_what, sent) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { saved, call } = devices();
    await expect(call('turnOnAppNotifications', { ...phone, ...sent })).rejects.toThrow(
      DEVICE_FAILED,
    );
    expect(saved).toEqual([]);
  });

  it('keeps only plain words of the label', async () => {
    const { saved, call } = devices();
    await call('turnOnAppNotifications', { ...phone, label: '<b>Mac</b>' });
    await call('turnOnAppNotifications', { ...phone, label: 42 });
    expect(saved.map((s) => s.subscription.label)).toEqual(['bMacb', null]);
  });

  it.each([null, {}, { sub: '' }])('fails unless a person is signed in (%j)', async (identity) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { saved, call } = devices();
    await expect(call('turnOnAppNotifications', phone, identity)).rejects.toThrow(DEVICE_FAILED);
    await expect(call('appNotificationKey', {}, identity)).rejects.toThrow(DEVICE_FAILED);
    expect(saved).toEqual([]);
  });

  it('logs what broke without what the device sent', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      devices().call('turnOnAppNotifications', { ...phone, endpoint: 'https://example.com/x' }),
    ).rejects.toThrow();
    const words = logged.mock.calls.flat().join(' ');
    expect(words).toContain('turnOnAppNotifications');
    expect(words).not.toContain('example.com');
    expect(words).not.toContain(phone.auth);
  });
});
