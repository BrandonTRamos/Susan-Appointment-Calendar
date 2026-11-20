import { describe, expect, it, vi } from 'vitest';
import { fromBase64Url } from '../../src/lib/vapid';
import {
  adminMessenger,
  userPoolAdmins,
  type PushPayload,
  type PushResult,
  type PushSender,
} from './admin-messenger';
import { dataApiDevices, type DeviceClient, type Subscription } from './app-notification-devices';

type Row = Record<string, unknown> & { id: string };

/**
 * Stands in for the data API's device and key tables, answering every call with `{ data }`. A
 * conditional delete is decided against the rows as they are when it is written, as DynamoDB
 * decides it; `beforeWrite` lets a test land someone else's write just before that moment.
 */
function dataApi() {
  const tables = { device: new Map<string, Row>(), key: new Map<string, Row>() };
  const beforeWrite: (() => Promise<void>)[] = [];
  const refused = {
    data: null,
    errors: [
      {
        message:
          'The conditional request failed (Service: DynamoDb, Status Code: 400, Request ID: x)',
        errorType: 'DynamoDB:ConditionalCheckFailedException',
      },
    ],
  };
  const model = (rows: Map<string, Row>) => ({
    async get({ id }: { id: string }) {
      return { data: rows.get(id) ?? null };
    },
    async list({ nextToken }: { nextToken?: string | null }) {
      // Two rows a page, so that reading every page is proven.
      const all = [...rows.values()];
      const from = Number(nextToken ?? 0);
      const next = from + 2 < all.length ? String(from + 2) : null;
      return { data: all.slice(from, from + 2), nextToken: next };
    },
    async create(input: Row) {
      if (rows.has(input.id))
        return { data: null, errors: [{ message: 'The conditional request failed' }] };
      rows.set(input.id, { ...input });
      return { data: input };
    },
    async update(input: Row) {
      rows.set(input.id, { ...rows.get(input.id), ...input });
      return { data: input };
    },
    async delete() {
      throw new Error('A device is never deleted without a condition.');
    },
  });
  /** Makes the next conditional delete fail for a reason that is not its condition. */
  let breakNext = false;
  const client = {
    models: { AppNotificationDevice: model(tables.device), AppNotificationKey: model(tables.key) },
    async graphql({ query, variables }: { query: string; variables: Record<string, unknown> }) {
      if (
        !/deleteAppNotificationDevice\(input: \{ id: \$id \}, condition: \$condition\)/.test(query)
      )
        throw new Error('Only the conditional delete is sent raw.');
      for (const write of beforeWrite.splice(0)) await write();
      if (breakNext) {
        breakNext = false;
        throw { data: null, errors: [{ message: 'Network error', errorType: 'Unknown' }] };
      }
      const { id, condition } = variables as {
        id: string;
        condition: { and: Record<string, { eq: string }>[] };
      };
      const row = tables.device.get(id);
      const holds = condition.and.every((each) =>
        Object.entries(each).every(([field, { eq }]) => row?.[field] === eq),
      );
      // As the data API's client does, the answer is thrown when it carries errors.
      if (!row || !holds) throw refused;
      tables.device.delete(id);
      return { data: { deleteAppNotificationDevice: { id } } };
    },
  } as unknown as DeviceClient;
  return {
    client,
    tables,
    devices: () => [...tables.device.values()],
    breakTheNextDelete: () => void (breakNext = true),
    /** Lands this write just before the next conditional delete is decided. */
    justBeforeTheNextDelete: (write: () => Promise<void>) => void beforeWrite.push(write),
  };
}

const subscription = (name: string): Subscription => ({
  endpoint: `https://web.push.apple.com/${name}`,
  p256dh: `p256dh-${name}`,
  auth: `auth-${name}`,
  label: 'iPhone',
});

/** A push service that keeps what reaches each endpoint, and answers as told for some. */
function pushService(answers: Record<string, PushResult> = {}) {
  const reached: { endpoint: string; payload: PushPayload }[] = [];
  const sender: PushSender = {
    async send(device, payload) {
      const answer = answers[device.endpoint] ?? 'sent';
      if (answer === 'sent') reached.push({ endpoint: device.endpoint, payload });
      return answer;
    },
  };
  return { sender, reached };
}

const update = {
  title: "Susan's Calendar",
  body: 'Linda added Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm.',
  opens: '/appointments/a1',
  tag: 'appointment-a1',
};

describe('the key pair that signs app notifications', () => {
  it('is made the first time anyone asks for it, and is the same one after that', async () => {
    const { client, tables } = dataApi();
    const devices = dataApiDevices(client);
    expect(await devices.keys()).toBeNull();
    const publicKey = await devices.publicKey();
    expect(fromBase64Url(publicKey)).toHaveLength(65);
    expect(await devices.publicKey()).toBe(publicKey);
    expect(await dataApiDevices(client).publicKey()).toBe(publicKey);
    expect(tables.key.size).toBe(1);
    expect((await devices.keys())?.publicKey).toBe(publicKey);
  });

  it('is the one someone else made at the same moment', async () => {
    const { client } = dataApi();
    const [first, second] = await Promise.all([
      dataApiDevices(client).publicKey(),
      dataApiDevices(client).publicKey(),
    ]);
    expect(second).toBe(first);
  });
});

describe('the devices app notifications go to', () => {
  it('are each kept once, against the account of the person who turned them on', async () => {
    const { client, devices: kept } = dataApi();
    const devices = dataApiDevices(client);
    await devices.save('person-linda', subscription('lindas-phone'));
    await devices.save('person-linda', subscription('lindas-phone'));
    await devices.save('person-linda', subscription('lindas-laptop'));
    await devices.save('person-mark', subscription('marks-phone'));
    expect(kept()).toHaveLength(3);
    expect((await devices.of(['person-linda'])).map((d) => d.endpoint).sort()).toEqual([
      'https://web.push.apple.com/lindas-laptop',
      'https://web.push.apple.com/lindas-phone',
    ]);
  });

  it('move to whoever turned them on last, as on a shared laptop', async () => {
    const { client } = dataApi();
    const devices = dataApiDevices(client);
    await devices.save('person-linda', subscription('shared'));
    await devices.save('person-mark', { ...subscription('shared'), auth: 'renewed' });
    expect(await devices.of(['person-linda'])).toEqual([]);
    expect(await devices.of(['person-mark'])).toMatchObject([{ auth: 'renewed' }]);
  });

  it('are forgotten by their endpoint for the person they are kept for', async () => {
    const { client, devices: kept } = dataApi();
    const devices = dataApiDevices(client);
    await devices.save('person-linda', subscription('lindas-phone'));
    await devices.save('person-mark', subscription('marks-phone'));
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/lindas-phone')).toBe(
      'forgotten',
    );
    expect(kept().map((d) => d.personId)).toEqual(['person-mark']);
  });

  it('are left alone when they are kept for someone else, whoever knows the endpoint', async () => {
    const { client, devices: kept } = dataApi();
    const devices = dataApiDevices(client);
    await devices.save('person-mark', subscription('marks-phone'));
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/marks-phone')).toBe(
      'someone-else',
    );
    expect(kept()).toMatchObject([{ personId: 'person-mark' }]);
  });

  it('that are not kept are already as good as forgotten, however often asked', async () => {
    const { client, devices: kept } = dataApi();
    const devices = dataApiDevices(client);
    await devices.save('person-linda', subscription('lindas-phone'));
    const endpoint = 'https://web.push.apple.com/lindas-phone';
    expect(await devices.forget('person-linda', endpoint)).toBe('forgotten');
    expect(await devices.forget('person-linda', endpoint)).toBe('not-kept');
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/never-kept')).toBe(
      'not-kept',
    );
    expect(kept()).toEqual([]);
  });

  it('are kept, and the request fails, when the delete fails for another reason', async () => {
    const api = dataApi();
    const devices = dataApiDevices(api.client);
    await devices.save('person-linda', subscription('lindas-phone'));
    api.breakTheNextDelete();
    await expect(
      devices.forget('person-linda', 'https://web.push.apple.com/lindas-phone'),
    ).rejects.toThrow('Network error');
    expect(api.devices()).toHaveLength(1);
  });

  it('stay with the person they moved to when the one before signs out late', async () => {
    const { client } = dataApi();
    const devices = dataApiDevices(client);
    await devices.save('person-linda', subscription('shared'));
    await devices.save('person-mark', subscription('shared'));
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/shared')).toBe(
      'someone-else',
    );
    expect(await devices.of(['person-mark'])).toMatchObject([
      { endpoint: 'https://web.push.apple.com/shared' },
    ]);
  });

  it('stay with someone who takes the device over just before it would be deleted', async () => {
    const api = dataApi();
    const devices = dataApiDevices(api.client);
    await devices.save('person-linda', subscription('shared'));
    // Linda's device as far as anything read before could tell; Mark's when the delete lands.
    expect(await devices.of(['person-linda'])).toHaveLength(1);
    api.justBeforeTheNextDelete(() => devices.save('person-mark', subscription('shared')));
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/shared')).toBe(
      'someone-else',
    );
    expect(await devices.of(['person-mark'])).toMatchObject([
      { endpoint: 'https://web.push.apple.com/shared' },
    ]);
  });

  it("are forgotten when they become the person's own just before the delete lands", async () => {
    const api = dataApi();
    const devices = dataApiDevices(api.client);
    await devices.save('person-mark', subscription('shared'));
    api.justBeforeTheNextDelete(() => devices.save('person-linda', subscription('shared')));
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/shared')).toBe(
      'forgotten',
    );
    expect(api.devices()).toEqual([]);
  });
});

describe('app notifications to Admins', () => {
  async function messenger(answers: Record<string, PushResult> = {}) {
    const api = dataApi();
    const devices = dataApiDevices(api.client);
    await devices.publicKey();
    await devices.save('person-linda', subscription('lindas-phone'));
    await devices.save('person-linda', subscription('lindas-laptop'));
    await devices.save('person-mark', subscription('marks-phone'));
    await devices.save('person-ann', subscription('anns-phone'));
    const push = pushService(answers);
    const admins = async () => ['person-linda', 'person-mark', 'person-ann'];
    return { ...api, push, messenger: adminMessenger({ admins, devices, push: push.sender }) };
  }

  it("reach every device of each person named, and nobody else's", async () => {
    const { messenger: m, push } = await messenger();
    await m.sendAppNotification(['person-linda', 'person-ann'], update);
    expect(push.reached.map((r) => r.endpoint).sort()).toEqual([
      'https://web.push.apple.com/anns-phone',
      'https://web.push.apple.com/lindas-laptop',
      'https://web.push.apple.com/lindas-phone',
    ]);
    expect(push.reached[0].payload).toEqual({
      title: "Susan's Calendar",
      body: 'Linda added Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm.',
      url: '/appointments/a1',
      tag: 'appointment-a1',
    });
  });

  it('forget a device whose subscription is gone, and still reach the others', async () => {
    const {
      messenger: m,
      push,
      devices,
    } = await messenger({
      'https://web.push.apple.com/lindas-laptop': 'gone',
      'https://web.push.apple.com/marks-phone': 'failed',
    });
    await m.sendAppNotification(['person-linda', 'person-mark', 'person-ann'], update);
    expect(push.reached.map((r) => r.endpoint).sort()).toEqual([
      'https://web.push.apple.com/anns-phone',
      'https://web.push.apple.com/lindas-phone',
    ]);
    // A failure is not a gone subscription: that device is kept and tried next time.
    expect(devices().map((d) => d.endpoint)).not.toContain(
      'https://web.push.apple.com/lindas-laptop',
    );
    expect(devices()).toHaveLength(3);
  });

  it('keep a gone device that was renewed or moved since it was sent to', async () => {
    const api = dataApi();
    const devices = dataApiDevices(api.client);
    await devices.publicKey();
    await devices.save('person-linda', subscription('shared'));
    const push = pushService({ 'https://web.push.apple.com/shared': 'gone' });
    const m = adminMessenger({
      admins: async () => ['person-linda'],
      devices,
      push: push.sender,
    });
    api.justBeforeTheNextDelete(() =>
      devices.save('person-mark', { ...subscription('shared'), auth: 'renewed' }),
    );
    await m.sendAppNotification(['person-linda'], update);
    expect(api.devices()).toMatchObject([{ personId: 'person-mark', auth: 'renewed' }]);
  });

  it('go nowhere while nobody has turned notifications on', async () => {
    const api = dataApi();
    const push = pushService();
    const m = adminMessenger({
      admins: async () => ['person-linda'],
      devices: dataApiDevices(api.client),
      push: push.sender,
    });
    await m.sendAppNotification(['person-linda'], update);
    expect(push.reached).toEqual([]);
  });
});

describe('who the Admins are', () => {
  it('is everyone in the Admins group, by person ID, on every page, unless disabled', async () => {
    const pages = [
      {
        Users: [
          { Enabled: true, Attributes: [{ Name: 'sub', Value: 'person-linda' }] },
          { Enabled: false, Attributes: [{ Name: 'sub', Value: 'person-gone' }] },
        ],
        NextToken: 'page-2',
      },
      { Users: [{ Enabled: true, Attributes: [{ Name: 'sub', Value: 'person-mark' }] }] },
    ];
    const send = vi.fn(async () => pages.shift());
    const admins = userPoolAdmins('pool-1', { send } as never);
    expect(await admins()).toEqual(['person-linda', 'person-mark']);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]).toMatchObject([
      { input: { UserPoolId: 'pool-1', GroupName: 'Admins' } },
    ]);
    expect(send.mock.calls[1]).toMatchObject([{ input: { NextToken: 'page-2' } }]);
  });
});
