// The calendar core's Admin messenger in the backend. It finds the Admins in the user pool and
// reaches them by app notification: web push to each device they turned notifications on for,
// signed with the key pair kept in the data API, as Wellbeing does. Ticket 15 adds email.

import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import webpush from 'web-push';
import type { AdminMessenger, AppNotification } from '../../src/lib/calendar';
import type { VapidKeys } from '../../src/lib/vapid';
import type { Device, Devices } from './app-notification-devices';

/** The group the owner puts each Admin's account in (README, "Accounts"). */
export const ADMINS_GROUP = 'Admins';

/** What a device's service worker is sent (public/app-notifications-sw.js). */
export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  tag: string;
}

/** `gone`: the device unsubscribed or the app was removed from it, so it is forgotten. */
export type PushResult = 'sent' | 'gone' | 'failed';

export interface PushSender {
  send(device: Device, payload: PushPayload, keys: VapidKeys): Promise<PushResult>;
}

/** Sends with the web-push library. `subject` names the sender to the push services. */
export function webPushSender(subject: string): PushSender {
  return {
    async send(device, payload, keys) {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify(payload),
          {
            vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
            TTL: 24 * 60 * 60,
            timeout: 5000,
          },
        );
        return 'sent';
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return 'gone';
        console.error('App notification failed', status ?? (error as Error).name);
        return 'failed';
      }
    },
  };
}

/** The person ID (the account's `sub`) of everyone in the Admins group. */
export function userPoolAdmins(
  userPoolId: string,
  client = new CognitoIdentityProviderClient({}),
): () => Promise<string[]> {
  return async () => {
    const admins: string[] = [];
    let NextToken: string | undefined;
    do {
      const page = await client.send(
        new ListUsersInGroupCommand({
          UserPoolId: userPoolId,
          GroupName: ADMINS_GROUP,
          NextToken,
        }),
      );
      for (const user of page.Users ?? []) {
        if (user.Enabled === false) continue;
        const sub = user.Attributes?.find((attribute) => attribute.Name === 'sub')?.Value;
        if (sub) admins.push(sub);
      }
      NextToken = page.NextToken;
    } while (NextToken);
    return admins;
  };
}

export interface MessengerDependencies {
  admins: () => Promise<string[]>;
  devices: Devices;
  push: PushSender;
}

export function adminMessenger({ admins, devices, push }: MessengerDependencies): AdminMessenger {
  return {
    admins,
    async sendAppNotification(to, notification: AppNotification) {
      if (to.length === 0) return;
      const [keys, reached] = await Promise.all([devices.keys(), devices.of(to)]);
      // No key pair yet means nobody has turned notifications on.
      if (!keys) return;
      const payload: PushPayload = {
        title: notification.title,
        body: notification.body,
        url: notification.opens,
        tag: notification.tag,
      };
      await Promise.all(
        reached.map(async (device) => {
          if ((await push.send(device, payload, keys)) !== 'gone') return;
          await devices.forgetGone(device).catch((error: unknown) => {
            console.error('Forgetting a gone device failed', (error as Error).name);
          });
        }),
      );
    },
  };
}
