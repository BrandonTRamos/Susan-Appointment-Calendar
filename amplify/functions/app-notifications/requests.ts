// Turning app notifications on and off for a device, as the data API calls this function
// (amplify/data/resource.ts). The device is kept against the signed-in person's account; who that
// is comes only from the identity the data API checked, never from what the device sent.

import type { Devices, Subscription } from '../../calendar/app-notification-devices';

/** What the data API hands a function for one query or mutation. */
export interface DeviceEvent {
  fieldName?: string;
  info?: { fieldName?: string };
  arguments: Record<string, unknown>;
  identity?: unknown;
}

/** Said when a request could not be carried out. It holds nothing the device sent. */
export const DEVICE_FAILED = 'Could not change notifications for this device. Try again.';

/**
 * The push services browsers subscribe through: Apple's, Google's, Mozilla's and Microsoft's. The
 * backend posts to a device's endpoint, so no other address is taken.
 */
const PUSH_SERVICES = [
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

const KEY = /^[A-Za-z0-9_-]{16,200}$/;

function person(identity: unknown): string {
  const { sub } = (identity ?? {}) as { sub?: unknown };
  if (typeof sub !== 'string' || !sub)
    throw new Error('No signed-in person came with the request.');
  return sub;
}

function endpointOf(sent: unknown): string {
  if (typeof sent !== 'string' || sent.length > 1000) throw new Error('Unreadable endpoint.');
  const url = new URL(sent);
  if (url.protocol !== 'https:' || !PUSH_SERVICES.some((host) => host.test(url.hostname)))
    throw new Error('The endpoint is not a known push service.');
  return sent;
}

function subscriptionOf(args: Record<string, unknown>): Subscription {
  const { p256dh, auth, label } = args;
  if (typeof p256dh !== 'string' || !KEY.test(p256dh)) throw new Error('Unreadable p256dh key.');
  if (typeof auth !== 'string' || !KEY.test(auth)) throw new Error('Unreadable auth secret.');
  const words =
    typeof label === 'string'
      ? label
          .replace(/[^\w ]/g, '')
          .trim()
          .slice(0, 40)
      : '';
  return { endpoint: endpointOf(args.endpoint), p256dh, auth, label: words || null };
}

export function appNotificationsHandler({ devices }: { devices: () => Promise<Devices> }) {
  return async (event: DeviceEvent): Promise<string | boolean> => {
    const request = event.fieldName ?? event.info?.fieldName;
    try {
      const personId = person(event.identity);
      const kept = await devices();
      switch (request) {
        case 'appNotificationKey':
          return await kept.publicKey();
        case 'turnOnAppNotifications':
          await kept.save(personId, subscriptionOf(event.arguments));
          return true;
        case 'turnOffAppNotifications':
          await kept.forget(endpointOf(event.arguments.endpoint));
          return true;
        default:
          throw new Error(`Unknown request: ${String(request)}`);
      }
    } catch (error) {
      const e = error instanceof Error ? error : null;
      // What broke, and nothing the device sent.
      console.error(
        'App notifications request failed',
        String(request),
        e?.name ?? 'Unknown error',
        e?.message.slice(0, 200) ?? '',
      );
      throw new Error(DEVICE_FAILED, { cause: error });
    }
  };
}
