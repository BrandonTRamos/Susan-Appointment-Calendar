// The devices app notifications go to, and the key pair that signs them, kept in the data API
// (amplify/data/resource.ts) and reached only by the backend's functions. Each device is kept
// against the account of the person who turned notifications on for it.
//
// Every write that depends on whose a device is carries that as a condition, which DynamoDB checks
// as it writes. When it refuses, why is read straight from the table with a strongly consistent
// read: the data API's own reads are eventually consistent, and a stale "not kept" must never let a
// browser drop a subscription that is someone else's. When even that read cannot settle it, the
// answer is "unconfirmed", and the browser keeps its subscription.

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { generateClient } from 'aws-amplify/data';
import type { DeviceRemoval, DeviceRenewal } from '../../src/lib/appNotifications';
import { generateVapidKeys, type VapidKeys } from '../../src/lib/vapid';
import type { Schema } from '../data/resource';

type Models = ReturnType<typeof generateClient<Schema>>['models'];

/** The part of the data API this uses. */
export interface DeviceClient {
  models: {
    AppNotificationDevice: Pick<Models['AppNotificationDevice'], 'list' | 'create' | 'update'>;
    AppNotificationKey: Pick<Models['AppNotificationKey'], 'get' | 'create'>;
  };
  /**
   * A raw data API operation. A write that depends on whose a device is needs one: the models' own
   * `delete` and `update` cannot carry a condition, and the data API's can. It throws its answer
   * when that carries errors.
   */
  graphql(options: { query: string; variables: Record<string, unknown> }): Promise<GraphqlAnswer>;
}

/** What a raw data API operation answers. */
export interface GraphqlAnswer {
  data?: unknown;
  errors?: readonly { message: string; errorType?: string | null }[];
}

/**
 * Deletes a device only if, at the moment DynamoDB deletes it, it is still kept as it was: the
 * data API adds `condition` to its own check that the row exists, in the one conditional write
 * (`npm run synth` checks that its resolver does). Nothing read beforehand decides it.
 */
const FORGET_DEVICE = /* GraphQL */ `
  mutation ForgetDevice($id: ID!, $condition: ModelAppNotificationDeviceConditionInput!) {
    deleteAppNotificationDevice(input: { id: $id }, condition: $condition) {
      id
    }
  }
`;

/** Updates a device only if it is still kept as `condition` says, in the same way. */
const RENEW_DEVICE = /* GraphQL */ `
  mutation RenewDevice(
    $input: UpdateAppNotificationDeviceInput!
    $condition: ModelAppNotificationDeviceConditionInput!
  ) {
    updateAppNotificationDevice(input: $input, condition: $condition) {
      id
    }
  }
`;

/** Reads whose a device is, straight from its table, consistently: as it is now. */
export interface DeviceReader {
  personOf(id: string): Promise<{ personId: string } | null>;
}

/** The part of the DynamoDB document client the reader uses. */
export interface TableClient {
  send(command: GetCommand): Promise<{ Item?: Record<string, unknown> }>;
}

/** A device reader over the AppNotificationDevice table (amplify/backend.ts names it). */
export function tableDeviceReader(client: TableClient, table: string): DeviceReader {
  return {
    async personOf(id) {
      const { Item } = await client.send(
        new GetCommand({
          TableName: table,
          Key: { id },
          ProjectionExpression: 'personId',
          ConsistentRead: true,
        }),
      );
      return typeof Item?.personId === 'string' ? { personId: Item.personId } : null;
    },
  };
}

/** How many times a write is tried again when the device turns out to be the person's after all. */
const ATTEMPTS = 3;

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

/** Whether every error is DynamoDB refusing a condition: nothing was written. */
const refusedOnly = (errors: readonly { message: string; errorType?: string | null }[]) =>
  errors.length > 0 &&
  errors.every((e) => /ConditionalCheckFailed/.test(`${e.errorType ?? ''} ${e.message}`));

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
   * Keeps a device against a person's account, when they turn notifications on for it in Settings.
   * A device already kept for someone else, as when they share a laptop, moves to this person: a
   * device is one person's at a time, and turning them on is how it changes hands.
   */
  save(personId: string, subscription: Subscription): Promise<void>;
  /**
   * Keeps this person's device up to date, as the app does when it opens: its subscription's keys
   * and label, only if it is still theirs when it is written. It never takes a device that is
   * someone else's, nor keeps one nobody does: only turning them on does that.
   */
  renew(personId: string, subscription: Subscription): Promise<DeviceRenewal>;
  /**
   * Forgets this person's device with this endpoint, only if it is still theirs when it is
   * deleted. Says which happened: forgotten; not kept at all, which is as good; kept for someone
   * else, as when it moved to them before a late sign-out on it, and so left with them; or
   * unconfirmed, when why it was refused could not be read.
   */
  forget(personId: string, endpoint: string): Promise<DeviceRemoval>;
  /**
   * Forgets a device whose subscription its push service says is gone, only if it is still kept
   * for the same person with the same subscription: one renewed or moved since is left alone.
   */
  forgetGone(device: Device): Promise<void>;
  /** Every device kept for one of these people. */
  of(personIds: readonly string[]): Promise<Device[]>;
}

/**
 * `reader` settles why a write was refused. The calendar-commands function, which only forgets
 * gone devices, has none.
 */
export function dataApiDevices(client: DeviceClient, reader?: DeviceReader): Devices {
  const { AppNotificationDevice, AppNotificationKey } = client.models;

  async function keys(): Promise<VapidKeys | null> {
    const row = check(await AppNotificationKey.get({ id: KEY_ID }));
    return row ? { publicKey: row.publicKey, privateKey: row.privateKey } : null;
  }

  /** Sends a conditional write. False when DynamoDB refused its condition and wrote nothing. */
  async function writeIf(query: string, variables: Record<string, unknown>) {
    let answer: GraphqlAnswer;
    try {
      answer = await client.graphql({ query, variables });
    } catch (thrown) {
      // The data API's client throws the whole answer when it carries errors.
      if (!(thrown && typeof thrown === 'object' && 'errors' in thrown)) throw thrown;
      answer = thrown as GraphqlAnswer;
    }
    if (!answer.errors?.length) return true;
    if (refusedOnly(answer.errors)) return false;
    throw new Error(answer.errors.map((e) => e.message).join('; '));
  }

  const condition = (kept: Partial<Record<keyof Device, string>>) => ({
    and: Object.entries(kept).map(([field, eq]) => ({ [field]: { eq } })),
  });

  /**
   * Deletes the device if every field in `kept` still holds at the moment of deletion. False when
   * it does not, or the device is not kept.
   */
  const deleteIf = (id: string, kept: Partial<Record<keyof Device, string>>) =>
    writeIf(FORGET_DEVICE, { id, condition: condition(kept) });

  /**
   * Why a write on condition that the device is this person's was refused, read as the table is
   * now: not kept, or someone else's. Null when it is the person's after all, as when they turned
   * notifications on again in between, so the write can be tried again.
   */
  async function whyRefused(
    id: string,
    personId: string,
  ): Promise<'not-kept' | 'someone-else' | 'unconfirmed' | null> {
    if (!reader) return 'unconfirmed';
    let now: { personId: string } | null;
    try {
      now = await reader.personOf(id);
    } catch (error) {
      console.error('Could not read whose a device is', (error as Error).name);
      return 'unconfirmed';
    }
    if (!now) return 'not-kept';
    return now.personId === personId ? null : 'someone-else';
  }

  return {
    keys,
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
      // Turning them on takes the device whoever has it, so nothing read beforehand decides
      // anything: the data API's create refuses one that is kept, and its update one that is not.
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const created = await AppNotificationDevice.create(row);
        if (!created.errors?.length) return;
        if (!refusedOnly(created.errors)) check(created);
        const updated = await AppNotificationDevice.update(row);
        if (!updated.errors?.length) return;
        if (!refusedOnly(updated.errors)) check(updated);
      }
      throw new Error('The device was added and removed again while it was being kept.');
    },
    async renew(personId, { endpoint, p256dh, auth, label }) {
      const id = await deviceId(endpoint);
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const input = { id, p256dh, auth, label };
        if (await writeIf(RENEW_DEVICE, { input, condition: condition({ personId }) }))
          return 'renewed';
        const why = await whyRefused(id, personId);
        if (why) return why;
      }
      return 'unconfirmed';
    },
    async forget(personId, endpoint) {
      const id = await deviceId(endpoint);
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        if (await deleteIf(id, { personId })) return 'forgotten';
        // Refused, so nothing was deleted. The table as it is now says why.
        const why = await whyRefused(id, personId);
        if (why) return why;
      }
      return 'unconfirmed';
    },
    async forgetGone({ id, personId, p256dh, auth }) {
      await deleteIf(id, { personId, p256dh, auth });
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
