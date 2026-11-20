// The devices app notifications go to, and the key pair that signs them, kept in the data API
// (amplify/data/resource.ts) and reached only by the backend's functions. Each device is kept
// against the account of the person who turned notifications on for it.

import type { generateClient } from 'aws-amplify/data';
import { generateVapidKeys, type VapidKeys } from '../../src/lib/vapid';
import type { Schema } from '../data/resource';

type Models = ReturnType<typeof generateClient<Schema>>['models'];

/** The part of the data API this uses. */
export interface DeviceClient {
  models: {
    AppNotificationDevice: Pick<
      Models['AppNotificationDevice'],
      'get' | 'list' | 'create' | 'update' | 'delete'
    >;
    AppNotificationKey: Pick<Models['AppNotificationKey'], 'get' | 'create'>;
  };
}

/** A device's push subscription, as the browser gives it. */
export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** What kind of device it is, such as "iPhone". */
  label: string | null;
}

/** A device app notifications go to, and whose it is. */
export interface Device extends Subscription {
  id: string;
  personId: string;
}

/** The one key pair's row. */
const KEY_ID = 'vapid';

function check<T>(result: { data: T; errors?: readonly { message: string }[] }): T {
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join('; '));
  return result.data;
}

/** A device's ID: the SHA-256 of its push endpoint, so the same device is kept once. */
export async function deviceId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface Devices {
  /** The public key devices subscribe with. The first time it is asked for, the pair is made. */
  publicKey(): Promise<string>;
  /** The key pair, or null while nobody has turned notifications on. */
  keys(): Promise<VapidKeys | null>;
  /**
   * Keeps a device against a person's account. A device already kept for someone else, as when
   * they share a laptop, moves to this person: a device is one person's at a time.
   */
  save(personId: string, subscription: Subscription): Promise<void>;
  /**
   * Forgets this person's device with this endpoint. Nothing happens when it is not kept, or is
   * kept for someone else, as when it moved to them before a late sign-out on it.
   */
  forget(personId: string, endpoint: string): Promise<void>;
  /** Forgets a device by its ID: one whose subscription is gone. */
  forgetById(id: string): Promise<void>;
  /** Every device kept for one of these people. */
  of(personIds: readonly string[]): Promise<Device[]>;
}

export function dataApiDevices(client: DeviceClient): Devices {
  const { AppNotificationDevice, AppNotificationKey } = client.models;

  async function keys(): Promise<VapidKeys | null> {
    const row = check(await AppNotificationKey.get({ id: KEY_ID }));
    return row ? { publicKey: row.publicKey, privateKey: row.privateKey } : null;
  }

  async function forgetById(id: string) {
    // Deleting a device that is not kept answers with no row and no error.
    check(await AppNotificationDevice.delete({ id }));
  }

  return {
    keys,
    forgetById,
    async publicKey() {
      const kept = await keys();
      if (kept) return kept.publicKey;
      const made = await generateVapidKeys();
      const created = await AppNotificationKey.create({ id: KEY_ID, ...made });
      if (!created.errors?.length) return made.publicKey;
      // Someone else made the pair at the same moment: theirs is the one.
      const raced = await keys();
      if (raced) return raced.publicKey;
      return check(created) as never;
    },
    async save(personId, { endpoint, p256dh, auth, label }) {
      const id = await deviceId(endpoint);
      const row = { id, personId, endpoint, p256dh, auth, label };
      const kept = check(await AppNotificationDevice.get({ id }));
      if (!kept) check(await AppNotificationDevice.create(row));
      else if (
        kept.personId !== personId ||
        kept.p256dh !== p256dh ||
        kept.auth !== auth ||
        (kept.label ?? null) !== label
      )
        check(await AppNotificationDevice.update(row));
    },
    async forget(personId, endpoint) {
      const id = await deviceId(endpoint);
      const kept = check(await AppNotificationDevice.get({ id }));
      if (kept?.personId === personId) await forgetById(id);
    },
    async of(personIds) {
      const wanted = new Set(personIds);
      const devices: Device[] = [];
      let nextToken: string | null | undefined;
      do {
        const page = await AppNotificationDevice.list({ limit: 1000, nextToken });
        for (const row of check(page))
          if (wanted.has(row.personId))
            devices.push({
              id: row.id,
              personId: row.personId,
              endpoint: row.endpoint,
              p256dh: row.p256dh,
              auth: row.auth,
              label: row.label ?? null,
            });
        nextToken = page.nextToken;
      } while (nextToken);
      return devices;
    },
  };
}
