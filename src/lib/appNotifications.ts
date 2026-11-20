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
 * What became of a request to forget this device for the signed-in person: forgotten; not kept at
 * all, which is as good; kept for someone else, who turned notifications on here since, and so
 * left with them; or unconfirmed, when the backend refused but could not say why. Only the first
 * two let the browser drop its subscription.
 */
export const DEVICE_REMOVALS = ['forgotten', 'not-kept', 'someone-else', 'unconfirmed'] as const;
export type DeviceRemoval = (typeof DEVICE_REMOVALS)[number];

/**
 * What became of keeping this device up to date for the signed-in person: renewed, as theirs;
 * not kept for anyone; kept for someone else; or unconfirmed. Only "renewed" means notifications
 * on this device are this person's.
 */
export const DEVICE_RENEWALS = ['renewed', 'not-kept', 'someone-else', 'unconfirmed'] as const;
export type DeviceRenewal = (typeof DEVICE_RENEWALS)[number];

/**
 * Where devices are kept against the signed-in person's account (src/data/appNotificationDevices.ts).
 * There is none on sample data.
 */
export interface DeviceRegistry {
  /** The public key a device subscribes with. */
  publicKey(): Promise<string>;
  /** Turns them on here for the signed-in person, taking the device from anyone who had it. */
  turnOn(subscription: DeviceSubscription): Promise<void>;
  /**
   * Keeps this device up to date for the signed-in person, only if it is already theirs. It never
   * takes a device, so the app can ask it whenever it opens.
   */
  renew(subscription: DeviceSubscription): Promise<DeviceRenewal>;
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
  /**
   * The browser has a subscription, but notifications on this device are not this person's: the
   * backend keeps it for someone else, or could not say. It is left as it is.
   */
  | 'someone-else';

/** Only a device the backend confirms is the person's counts as on for them. */
const STATE_OF: Record<DeviceRenewal, AppNotificationState> = {
  renewed: 'on',
  'not-kept': 'off',
  'someone-else': 'someone-else',
  unconfirmed: 'someone-else',
};

/** Only these answers mean the browser's subscription is nobody else's, so it may be dropped. */
const MAY_DROP: readonly DeviceRemoval[] = ['forgotten', 'not-kept'];

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
  const subscription = await currentSubscription();
  if (!subscription) return 'off';
  // The browser's subscription alone does not say whose it is: the backend does.
  return STATE_OF[await registry.renew(subscriptionOf(subscription))];
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

function subscriptionOf(subscription: PushSubscription): DeviceSubscription {
  const { keys } = subscription.toJSON();
  if (!keys?.p256dh || !keys.auth) throw new Error('The browser gave an incomplete subscription.');
  return {
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    label: deviceLabel(),
  };
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
  const made = !subscription;
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(publicKey),
  });
  try {
    await registry.turnOn(subscriptionOf(subscription));
  } catch (error) {
    // Not kept, so nothing would reach it. A subscription made just now is undone too, so that
    // this device never shows as on while the backend does not have it. One the browser had
    // already may be someone else's, so it is left alone.
    if (made) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  return 'on';
}

/**
 * Stops this device getting this person's app notifications, and forgets it. Unless the backend
 * confirms that it was this person's or nobody's, the browser's subscription is left as it is: it
 * may be someone else's, who turned them on here since.
 */
export async function turnOff(registry: DeviceRegistry): Promise<AppNotificationState> {
  const subscription = await currentSubscription();
  if (!subscription) return 'off';
  if (!MAY_DROP.includes(await registry.turnOff(subscription.endpoint))) return 'someone-else';
  await subscription.unsubscribe();
  return 'off';
}

/**
 * Keeps this device's subscription up to date when the app opens: a browser can renew its keys.
 * It only ever renews a device the backend already keeps for this person, so opening an older
 * session never takes a device someone else has turned notifications on for since.
 */
export async function keepSaved(registry: DeviceRegistry | null): Promise<void> {
  await appNotificationState(registry);
}

/**
 * At sign-out: forgets this device for this person and unsubscribes it, so that the next person to
 * use it is not sent this person's notifications. It never stops the sign-out.
 *
 * - When the backend finds the device kept for someone else, who turned them on here since, or
 *   refuses to forget it without being able to say why, the device is already not this person's:
 *   the subscription and the notifications showing are left alone for whoever's it is.
 * - When the backend cannot be reached at all, nobody can say whether it is still this person's,
 *   so it is unsubscribed anyway: this person's notifications must not reach whoever uses it next.
 *   The backend forgets it the next time anything is sent to it.
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
    if (removal && !MAY_DROP.includes(removal)) return;
    await subscription.unsubscribe();
    const registration = await navigator.serviceWorker.getRegistration();
    for (const shown of (await registration?.getNotifications()) ?? []) shown.close();
  } catch (error) {
    console.warn('Could not turn notifications off at sign-out', error);
  }
}
