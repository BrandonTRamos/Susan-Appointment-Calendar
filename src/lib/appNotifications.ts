// App notifications on the device in hand: turning them on and off, keeping the device's
// subscription saved, and forgetting the device at sign-out. This follows Wellbeing's web push. The
// backend sends them (amplify/calendar/admin-messenger.ts) and the service worker shows them
// (public/app-notifications-sw.js).

import { fromBase64Url, sameKey } from './vapid';

/** A device's push subscription, as the backend keeps it. */
export interface DeviceSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** What kind of device it is, such as "iPhone". */
  label: string;
}

/**
 * What became of a request to forget this device: forgotten; not kept at all, which is as good;
 * or kept for someone else, who turned notifications on here since, and so left with them.
 */
export const DEVICE_REMOVALS = ['forgotten', 'not-kept', 'someone-else'] as const;
export type DeviceRemoval = (typeof DEVICE_REMOVALS)[number];

/**
 * Where devices are kept against the signed-in person's account (src/data/appNotificationDevices.ts).
 * There is none on sample data.
 */
export interface DeviceRegistry {
  /** The public key a device subscribes with. */
  publicKey(): Promise<string>;
  turnOn(subscription: DeviceSubscription): Promise<void>;
  /** Forgets this device for the signed-in person, only if it is still theirs. */
  turnOff(endpoint: string): Promise<DeviceRemoval>;
}

/**
 * - `unavailable`: sample data, or a browser that has no web push.
 * - `home-screen`: an iPhone or iPad, where only the app added to the home screen has web push.
 * - `blocked`: the person said no when asked, so only the device's settings can allow them.
 */
export type AppNotificationState =
  | 'unavailable'
  | 'home-screen'
  | 'blocked'
  | 'off'
  | 'on'
  /** Turning them off found this device kept for someone else, so it was left on for them. */
  | 'someone-else';

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** An iPhone, iPod or iPad, including an iPad that says it is a Mac. */
const onIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function appNotificationState(
  registry: DeviceRegistry | null,
): Promise<AppNotificationState> {
  if (!registry) return 'unavailable';
  if (!supported()) return onIos() ? 'home-screen' : 'unavailable';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Browser';
}

async function save(registry: DeviceRegistry, subscription: PushSubscription) {
  const { keys } = subscription.toJSON();
  if (!keys?.p256dh || !keys.auth) throw new Error('The browser gave an incomplete subscription.');
  await registry.turnOn({
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    label: deviceLabel(),
  });
}

/** Asks for permission (call it straight from a tap), subscribes, and keeps this device. */
export async function turnOn(registry: DeviceRegistry): Promise<AppNotificationState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const publicKey = await registry.publicKey();
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  // A subscription made with another key cannot receive these.
  if (subscription && !sameKey(subscription.options.applicationServerKey, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(publicKey),
  });
  try {
    await save(registry, subscription);
  } catch (error) {
    // Not kept, so nothing would reach it. Undo the subscription too, so that this device never
    // shows as on while the backend does not have it.
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  return 'on';
}

/**
 * Stops this device getting this person's app notifications, and forgets it. When the backend
 * finds it kept for someone else, who turned them on here since, it is left as it is: its browser
 * subscription is theirs now too.
 */
export async function turnOff(registry: DeviceRegistry): Promise<AppNotificationState> {
  const subscription = await currentSubscription();
  if (!subscription) return 'off';
  if ((await registry.turnOff(subscription.endpoint)) === 'someone-else') return 'someone-else';
  await subscription.unsubscribe();
  return 'off';
}

/**
 * Saves this device's subscription again when the app opens. The backend forgets a device whose
 * subscription is gone, and a browser can renew one; either way this puts it back.
 */
export async function keepSaved(registry: DeviceRegistry | null): Promise<void> {
  if ((await appNotificationState(registry)) !== 'on' || !registry) return;
  const subscription = await currentSubscription();
  if (subscription) await save(registry, subscription);
}

/**
 * At sign-out: forgets this device for this person and unsubscribes it, so that the next person to
 * use it is not sent this person's notifications. It never stops the sign-out.
 *
 * - When the backend finds the device kept for someone else, who turned them on here since, their
 *   subscription and the notifications showing are left alone.
 * - When the backend cannot be reached, nobody can say whose the device is, so it is unsubscribed
 *   anyway: this person's notifications must not reach whoever uses it next. The backend forgets
 *   it the next time anything is sent to it.
 */
export async function forgetAtSignOut(registry: DeviceRegistry | null): Promise<void> {
  if (!registry || !supported()) return;
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    let removal: DeviceRemoval | null = null;
    try {
      removal = await registry.turnOff(subscription.endpoint);
    } catch (error) {
      console.warn('Could not forget this device at sign-out', error);
    }
    if (removal === 'someone-else') return;
    await subscription.unsubscribe();
    const registration = await navigator.serviceWorker.getRegistration();
    for (const shown of (await registration?.getNotifications()) ?? []) shown.close();
  } catch (error) {
    console.warn('Could not turn notifications off at sign-out', error);
  }
}
