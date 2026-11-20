// The calendar core's Admin messenger in the backend. It finds the Admins in the user pool and
// reaches them by app notification, web push to each device they turned notifications on for,
// signed with the key pair kept in the data API, as Wellbeing does; and by email, through AWS's
// email service to the address each signs in with (alert-email.ts).

import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import webpush from 'web-push';
import type { AdminMessenger, AppNotification, Deliveries } from '../../src/lib/calendar';
import type { VapidKeys } from '../../src/lib/vapid';
import type { EmailSender } from './alert-email';
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

/** An Admin's account: its person ID (the account's `sub`) and the address it signs in with. */
export interface AdminAccount {
  id: string;
  email: string | null;
}

/** Everyone in the Admins group whose account is enabled. Susan's account is never in it. */
export function userPoolAdmins(
  userPoolId: string,
  client = new CognitoIdentityProviderClient({}),
): () => Promise<AdminAccount[]> {
  return async () => {
    const admins: AdminAccount[] = [];
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
        const attribute = (name: string) =>
          user.Attributes?.find((each) => each.Name === name)?.Value ?? null;
        const sub = attribute('sub');
        if (sub) admins.push({ id: sub, email: attribute('email') });
      }
      NextToken = page.NextToken;
    } while (NextToken);
    return admins;
  };
}

export interface MessengerDependencies {
  admins: () => Promise<AdminAccount[]>;
  devices: Devices;
  push: PushSender;
  /** How email is sent; null where it is not set up, and then none is. */
  email?: EmailSender | null;
  /** The app's address, which an email's link is made from (amplify/app-url.ts). */
  appUrl?: string;
}

export function adminMessenger({
  admins,
  devices,
  push,
  email = null,
  appUrl = '',
}: MessengerDependencies): AdminMessenger {
  return {
    async admins() {
      return (await admins()).map((admin) => admin.id);
    },
    // Each delivery is one device, named 'app:<device ID>'.
    async sendAppNotification(to, notification: AppNotification, skip = []) {
      const result: Deliveries = { sent: [], failed: [], refused: [] };
      if (to.length === 0) return result;
      const [keys, reached] = await Promise.all([devices.keys(), devices.of(to)]);
      // No key pair yet means nobody has turned notifications on: nothing to reach.
      if (!keys) return result;
      const payload: PushPayload = {
        title: notification.title,
        body: notification.body,
        url: notification.opens,
        tag: notification.tag,
      };
      await Promise.all(
        reached.map(async (device) => {
          const key = `app:${device.id}`;
          if (skip.includes(key)) return;
          const went = await push.send(device, payload, keys);
          if (went === 'sent') result.sent.push(key);
          if (went === 'failed') result.failed.push(key);
          // Gone: nothing to reach there any more, so it is forgotten and not tried again.
          if (went !== 'gone') return;
          await devices.forgetGone(device).catch((error: unknown) => {
            console.error('Forgetting a gone device failed', (error as Error).name);
          });
        }),
      );
      return result;
    },
    // Each delivery is one email to one Admin, named 'email:<person ID>', and only to an Admin's
    // own sign-in address: a person ID that is not an Admin's, such as Susan's, reaches nobody.
    async sendEmail(to, { subject, body, opens }, skip = []) {
      const result: Deliveries = { sent: [], failed: [], refused: [] };
      if (to.length === 0) return result;
      // Not set up: nothing to reach by email, which is not a failure.
      if (!email) {
        console.log('Alert email is not set up, so none was sent');
        return result;
      }
      // The only words the messenger adds: the address of what it is about, on a line of its own.
      const link = /^https?:\/\//.test(appUrl) ? `\n\n${new URL(opens, appUrl).href}` : '';
      for (const admin of await admins()) {
        const key = `email:${admin.id}`;
        if (!to.includes(admin.id) || !admin.email || skip.includes(key)) continue;
        const went = await email.send({ to: admin.email, subject, body: `${body}${link}` });
        result[went === 'rejected' ? 'refused' : went].push(key);
      }
      return result;
    },
  };
}
