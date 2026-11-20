// A browser's web push, for screen tests: jsdom has none. It stands in for the service worker
// registration, its push manager and the Notification permission, and keeps what was asked of it.

import type {
  DeviceRegistry,
  DeviceRemoval,
  DeviceRenewal,
  DeviceSubscription,
} from '../lib/appNotifications';
import { fromBase64Url } from '../lib/vapid';

/** A public key of the right shape: a 65-byte P-256 point, base64url. */
export const PUBLIC_KEY = btoa(String.fromCharCode(4, ...Array.from({ length: 64 }, (_, i) => i)))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

export interface FakePushOptions {
  /** What the device already says about notifications. */
  permission?: NotificationPermission;
  /** What the person answers when asked. */
  answer?: NotificationPermission;
  /** Start with this device already subscribed. */
  subscribed?: boolean;
  /** Leave web push out, as Safari on an iPhone does until the app is on the home screen. */
  noPush?: boolean;
  userAgent?: string;
}

export function installFakePush({
  permission = 'default',
  answer = 'granted',
  subscribed = false,
  noPush = false,
  userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
}: FakePushOptions = {}) {
  let current: PushSubscription | null = null;
  let made = 0;
  const shown = [{ close: () => void (shownClosed += 1) }];
  let shownClosed = 0;

  const subscription = (key: ArrayBuffer): PushSubscription => {
    made += 1;
    const endpoint = `https://web.push.apple.com/device-${made}`;
    const self = {
      endpoint,
      options: { applicationServerKey: key, userVisibleOnly: true },
      toJSON: () => ({ endpoint, keys: { p256dh: `p256dh-${made}`, auth: `auth-${made}` } }),
      unsubscribe: async () => {
        if (current === (self as unknown as PushSubscription)) current = null;
        return true;
      },
    };
    return self as unknown as PushSubscription;
  };
  if (subscribed) current = subscription(fromBase64Url(PUBLIC_KEY).buffer);

  const registration = {
    pushManager: {
      getSubscription: async () => current,
      subscribe: async ({ applicationServerKey }: { applicationServerKey: Uint8Array }) =>
        (current = subscription(applicationServerKey.buffer as ArrayBuffer)),
    },
    getNotifications: async () => shown,
  };
  const container = Object.assign(new EventTarget(), {
    getRegistration: async () => registration,
    ready: Promise.resolve(registration),
  });

  const define = (target: object, key: string, value: unknown) =>
    Object.defineProperty(target, key, { value, configurable: true, writable: true });
  define(navigator, 'userAgent', userAgent);
  if (!noPush) {
    define(navigator, 'serviceWorker', container);
    define(window, 'PushManager', function PushManager() {});
    define(window, 'Notification', {
      permission,
      async requestPermission() {
        (window.Notification as { permission: NotificationPermission }).permission = answer;
        return answer;
      },
    });
  }

  return {
    /** This device's subscription, or null. */
    subscription: () => current,
    /** How many notifications showing on the device were closed. */
    closed: () => shownClosed,
    uninstall() {
      for (const key of ['serviceWorker', 'userAgent'])
        delete (navigator as unknown as Record<string, unknown>)[key];
      for (const key of ['PushManager', 'Notification'])
        delete (window as unknown as Record<string, unknown>)[key];
    },
  };
}

/** Where devices are kept, in memory, with each call noted. */
export function fakeRegistry({
  failing = false,
  failingTurnOn = false,
  removal = 'forgotten',
  renewal = 'renewed',
}: {
  /** Nothing can be reached. */
  failing?: boolean;
  /** The key can be had, but a device cannot be kept. */
  failingTurnOn?: boolean;
  /** What the backend finds when asked to forget this device. */
  removal?: DeviceRemoval;
  /** What the backend finds when asked to keep this device up to date. */
  renewal?: DeviceRenewal;
} = {}) {
  const turnedOn: DeviceSubscription[] = [];
  const turnedOff: string[] = [];
  const renewed: DeviceSubscription[] = [];
  const fail = async () => {
    if (failing) throw new Error('The data API is not answering');
  };
  const registry: DeviceRegistry = {
    async publicKey() {
      await fail();
      return PUBLIC_KEY;
    },
    async turnOn(device) {
      await fail();
      if (failingTurnOn) throw new Error('The data API is not answering');
      turnedOn.push(device);
    },
    async renew(device) {
      await fail();
      renewed.push(device);
      return renewal;
    },
    async turnOff(endpoint) {
      await fail();
      turnedOff.push(endpoint);
      return removal;
    },
  };
  return { registry, turnedOn, turnedOff, renewed };
}
