import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromBase64Url } from '../../src/lib/vapid';
import type { EmailResult, EmailSender, OutgoingEmail } from './alert-email';
import {
  adminMessenger,
  userPoolAdmins,
  type PushPayload,
  type PushResult,
  type PushSender,
} from './admin-messenger';
import {
  dataApiDevices,
  type DeviceClient,
  type DeviceReader,
  type Subscription,
} from './app-notification-devices';

afterEach(() => vi.restoreAllMocks());

type Row = Record<string, unknown> & { id: string };

/**
 * Stands in for the data API's device and key tables, answering every call with `{ data }`, and for
 * a strongly consistent read of the device table.
 *
 * - Every conditional write is decided against the rows as they are when it lands, as DynamoDB
 *   decides it. `justBeforeTheNextWrite` lands someone else's write just before that moment.
 * - The data API's own `get` is eventually consistent: it answers from a copy that is only brought
 *   up to date by `catchUp`, so it can say a device is not kept when it is.
 */
function dataApi() {
  const tables = { device: new Map<string, Row>(), key: new Map<string, Row>() };
  /** What an eventually consistent read of the device table sees. */
  let lagging = new Map<string, Row>();
  const beforeWrite: (() => Promise<void>)[] = [];
  let breakNext = false;
  let readsFail = false;
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
  const model = (rows: Map<string, Row>, read: () => Map<string, Row> = () => rows) => ({
    async get({ id }: { id: string }) {
      return { data: read().get(id) ?? null };
    },
    async list({ nextToken }: { nextToken?: string | null }) {
      // Two rows a page, so that reading every page is proven.
      const all = [...rows.values()];
      const from = Number(nextToken ?? 0);
      const next = from + 2 < all.length ? String(from + 2) : null;
      return { data: all.slice(from, from + 2), nextToken: next };
    },
    // Amplify's create refuses a row that exists, and its update one that does not. Model calls
    // answer errors rather than throwing them.
    async create(input: Row) {
      if (rows.has(input.id)) return refused;
      rows.set(input.id, { ...input });
      return { data: input };
    },
    async update(input: Row) {
      if (!rows.has(input.id)) return refused;
      rows.set(input.id, { ...rows.get(input.id), ...input });
      return { data: input };
    },
    async delete() {
      throw new Error('A device is never deleted without a condition.');
    },
  });
  const holds = (row: Row | undefined, condition: { and: Record<string, { eq: string }>[] }) =>
    row !== undefined &&
    condition.and.every((each) =>
      Object.entries(each).every(([field, { eq }]) => row[field] === eq),
    );
  const client = {
    models: {
      AppNotificationDevice: model(tables.device, () => lagging),
      AppNotificationKey: model(tables.key),
    },
    async graphql({ query, variables }: { query: string; variables: Record<string, unknown> }) {
      for (const write of beforeWrite.splice(0)) await write();
      if (breakNext) {
        breakNext = false;
        throw { data: null, errors: [{ message: 'Network error', errorType: 'Unknown' }] };
      }
      const { condition } = variables as { condition: { and: Record<string, { eq: string }>[] } };
      // As the data API's client does, the answer is thrown when it carries errors.
      if (
        /deleteAppNotificationDevice\(input: \{ id: \$id \}, condition: \$condition\)/.test(query)
      ) {
        const { id } = variables as { id: string };
        if (!holds(tables.device.get(id), condition)) throw refused;
        tables.device.delete(id);
        return { data: { deleteAppNotificationDevice: { id } } };
      }
      if (/updateAppNotificationDevice\(input: \$input, condition: \$condition\)/.test(query)) {
        const { input } = variables as { input: Row };
        if (!holds(tables.device.get(input.id), condition)) throw refused;
        tables.device.set(input.id, { ...tables.device.get(input.id)!, ...input });
        return { data: { updateAppNotificationDevice: { id: input.id } } };
      }
      throw new Error('Only conditional writes are sent raw.');
    },
  } as unknown as DeviceClient;
  /** A strongly consistent read: the rows as they are. */
  const reader: DeviceReader = {
    async personOf(id) {
      if (readsFail) throw new Error('DynamoDB is not answering');
      const row = tables.device.get(id);
      return row ? { personId: row.personId as string } : null;
    },
  };
  return {
    client,
    reader,
    tables,
    devices: () => [...tables.device.values()],
    /** What the data API's own, eventually consistent read of a device answers. */
    laggingRead: (id: string) => lagging.get(id) ?? null,
    /** Brings the eventually consistent copy up to date. */
    catchUp: () => void (lagging = new Map(tables.device)),
    failReads: () => void (readsFail = true),
    breakTheNextWrite: () => void (breakNext = true),
    /** Lands this write just before the next conditional write is decided. */
    justBeforeTheNextWrite: (write: () => Promise<void>) => void beforeWrite.push(write),
  };
}

/** The devices over a stand-in data API, with the consistent reader the function has. */
function kept() {
  const api = dataApi();
  return { api, devices: dataApiDevices(api.client, api.reader) };
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
    const { api, devices } = kept();
    await devices.save('person-linda', subscription('lindas-phone'));
    await devices.save('person-linda', subscription('lindas-phone'));
    await devices.save('person-linda', subscription('lindas-laptop'));
    await devices.save('person-mark', subscription('marks-phone'));
    expect(api.devices()).toHaveLength(3);
    expect((await devices.of(['person-linda'])).map((d) => d.endpoint).sort()).toEqual([
      'https://web.push.apple.com/lindas-laptop',
      'https://web.push.apple.com/lindas-phone',
    ]);
  });

  it('move to whoever turned them on last, as on a shared laptop', async () => {
    const { devices } = kept();
    await devices.save('person-linda', subscription('shared'));
    await devices.save('person-mark', { ...subscription('shared'), auth: 'renewed' });
    expect(await devices.of(['person-linda'])).toEqual([]);
    expect(await devices.of(['person-mark'])).toMatchObject([{ auth: 'renewed' }]);
  });

  it('are forgotten by their endpoint for the person they are kept for', async () => {
    const { api, devices } = kept();
    await devices.save('person-linda', subscription('lindas-phone'));
    await devices.save('person-mark', subscription('marks-phone'));
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/lindas-phone')).toBe(
      'forgotten',
    );
    expect(api.devices().map((d) => d.personId)).toEqual(['person-mark']);
  });

  it('are left alone when they are kept for someone else, whoever knows the endpoint', async () => {
    const { api, devices } = kept();
    await devices.save('person-mark', subscription('marks-phone'));
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/marks-phone')).toBe(
      'someone-else',
    );
    expect(api.devices()).toMatchObject([{ personId: 'person-mark' }]);
  });

  it('that are not kept are already as good as forgotten, however often asked', async () => {
    const { api, devices } = kept();
    await devices.save('person-linda', subscription('lindas-phone'));
    const endpoint = 'https://web.push.apple.com/lindas-phone';
    expect(await devices.forget('person-linda', endpoint)).toBe('forgotten');
    expect(await devices.forget('person-linda', endpoint)).toBe('not-kept');
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/never-kept')).toBe(
      'not-kept',
    );
    expect(api.devices()).toEqual([]);
  });

  it('are kept, and the request fails, when the delete fails for another reason', async () => {
    const { api, devices } = kept();
    await devices.save('person-linda', subscription('lindas-phone'));
    api.breakTheNextWrite();
    await expect(
      devices.forget('person-linda', 'https://web.push.apple.com/lindas-phone'),
    ).rejects.toThrow('Network error');
    expect(api.devices()).toHaveLength(1);
  });

  it('stay with the person they moved to when the one before signs out late', async () => {
    const { devices } = kept();
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
    const { api, devices } = kept();
    await devices.save('person-linda', subscription('shared'));
    // Linda's device as far as anything read before could tell; Mark's when the delete lands.
    expect(await devices.of(['person-linda'])).toHaveLength(1);
    api.justBeforeTheNextWrite(() => devices.save('person-mark', subscription('shared')));
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/shared')).toBe(
      'someone-else',
    );
    expect(await devices.of(['person-mark'])).toMatchObject([
      { endpoint: 'https://web.push.apple.com/shared' },
    ]);
  });

  it("are forgotten when they become the person's own just before the delete lands", async () => {
    const { api, devices } = kept();
    await devices.save('person-mark', subscription('shared'));
    api.justBeforeTheNextWrite(() => devices.save('person-linda', subscription('shared')));
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/shared')).toBe(
      'forgotten',
    );
    expect(api.devices()).toEqual([]);
  });

  it('stay with someone they moved to a moment ago, though a lagging read misses them', async () => {
    const { api, devices } = kept();
    // Mark has just turned notifications on here; the data API's own reads do not show it yet.
    await devices.save('person-mark', subscription('shared'));
    expect(api.laggingRead(api.devices()[0].id)).toBeNull();
    // Linda's late sign-out is refused, and the reason is read as the table is: Mark's device.
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/shared')).toBe(
      'someone-else',
    );
    expect(api.devices()).toMatchObject([{ personId: 'person-mark' }]);
  });

  it('are not called not kept when why the delete was refused cannot be read', async () => {
    const { api, devices } = kept();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await devices.save('person-mark', subscription('shared'));
    api.failReads();
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/shared')).toBe(
      'unconfirmed',
    );
    expect(api.devices()).toMatchObject([{ personId: 'person-mark' }]);
  });

  it('are never called not kept by a function that cannot read the table', async () => {
    const api = dataApi();
    const devices = dataApiDevices(api.client);
    expect(await devices.forget('person-linda', 'https://web.push.apple.com/never-kept')).toBe(
      'unconfirmed',
    );
  });

  it('move to whoever turns them on, without reading first, whatever a lagging read says', async () => {
    const { api, devices } = kept();
    await devices.save('person-linda', subscription('shared'));
    // Nothing read says Linda has it; turning them on takes it all the same.
    await devices.save('person-mark', { ...subscription('shared'), auth: 'marks-keys' });
    expect(api.devices()).toMatchObject([{ personId: 'person-mark', auth: 'marks-keys' }]);
  });
});

describe('keeping a device up to date as the app opens', () => {
  const renewed = { ...subscription('shared'), auth: 'renewed-keys', label: 'Mac' };

  it("renews the person's own device", async () => {
    const { api, devices } = kept();
    await devices.save('person-linda', subscription('shared'));
    expect(await devices.renew('person-linda', renewed)).toBe('renewed');
    expect(api.devices()).toMatchObject([
      { personId: 'person-linda', auth: 'renewed-keys', label: 'Mac' },
    ]);
  });

  it("never takes a device that is someone else's", async () => {
    const { api, devices } = kept();
    await devices.save('person-mark', subscription('shared'));
    // An older session of Linda's opens on the device Mark turned notifications on for since.
    expect(await devices.renew('person-linda', renewed)).toBe('someone-else');
    expect(api.devices()).toMatchObject([
      { personId: 'person-mark', auth: subscription('shared').auth },
    ]);
  });

  it('keeps no device that nobody turned notifications on for', async () => {
    const { api, devices } = kept();
    expect(await devices.renew('person-linda', renewed)).toBe('not-kept');
    expect(api.devices()).toEqual([]);
  });

  it('leaves a device someone else takes over just before the renewal lands', async () => {
    const { api, devices } = kept();
    await devices.save('person-linda', subscription('shared'));
    api.justBeforeTheNextWrite(() => devices.save('person-mark', subscription('shared')));
    expect(await devices.renew('person-linda', renewed)).toBe('someone-else');
    expect(api.devices()).toMatchObject([
      { personId: 'person-mark', auth: subscription('shared').auth },
    ]);
  });

  it('says unconfirmed, and changes nothing, when why it was refused cannot be read', async () => {
    const { api, devices } = kept();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await devices.save('person-mark', subscription('shared'));
    api.failReads();
    expect(await devices.renew('person-linda', renewed)).toBe('unconfirmed');
    expect(api.devices()).toMatchObject([{ personId: 'person-mark' }]);
  });
});

/** Admins' accounts, each signing in with an invented address at example.com. */
const accounts = (...ids: string[]) =>
  ids.map((id) => ({ id, email: `${id.replace('person-', '')}@example.com` }));

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
    const admins = async () => accounts('person-linda', 'person-mark', 'person-ann');
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
      admins: async () => accounts('person-linda'),
      devices,
      push: push.sender,
    });
    api.justBeforeTheNextWrite(() =>
      devices.save('person-mark', { ...subscription('shared'), auth: 'renewed' }),
    );
    await m.sendAppNotification(['person-linda'], update);
    expect(api.devices()).toMatchObject([{ personId: 'person-mark', auth: 'renewed' }]);
  });

  it('say what became of each device, and leave out those that went already', async () => {
    const { messenger: m, push } = await messenger({
      'https://web.push.apple.com/lindas-laptop': 'failed',
      'https://web.push.apple.com/marks-phone': 'gone',
    });
    const went = await m.sendAppNotification(['person-linda', 'person-mark'], update);
    expect(went.sent).toHaveLength(1);
    expect(went.failed).toHaveLength(1);
    // A gone device has nothing to reach any more: it is neither sent nor failed.
    expect(went.refused).toEqual([]);
    const again = await m.sendAppNotification(['person-linda', 'person-mark'], update, went.sent);
    expect(again.sent).toEqual([]);
    expect(again.failed).toEqual(went.failed);
    expect(push.reached.filter((r) => r.endpoint.endsWith('lindas-phone'))).toHaveLength(1);
  });

  it('go nowhere while nobody has turned notifications on', async () => {
    const api = dataApi();
    const push = pushService();
    const m = adminMessenger({
      admins: async () => accounts('person-linda'),
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
          {
            Enabled: true,
            Attributes: [
              { Name: 'sub', Value: 'person-linda' },
              { Name: 'email', Value: 'linda@example.com' },
              { Name: 'name', Value: 'Linda' },
            ],
          },
          { Enabled: false, Attributes: [{ Name: 'sub', Value: 'person-gone' }] },
        ],
        NextToken: 'page-2',
      },
      { Users: [{ Enabled: true, Attributes: [{ Name: 'sub', Value: 'person-mark' }] }] },
    ];
    const send = vi.fn(async () => pages.shift());
    const admins = userPoolAdmins('pool-1', { send } as never);
    expect(await admins()).toEqual([
      { id: 'person-linda', email: 'linda@example.com' },
      { id: 'person-mark', email: null },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]).toMatchObject([
      { input: { UserPoolId: 'pool-1', GroupName: 'Admins' } },
    ]);
    expect(send.mock.calls[1]).toMatchObject([{ input: { NextToken: 'page-2' } }]);
  });
});

describe('emails to Admins', () => {
  /** An email sender that keeps what it is asked to send, and answers as it is told to. */
  function emailService(answers: Record<string, EmailResult> = {}) {
    const sent: OutgoingEmail[] = [];
    return {
      sent,
      sender: {
        async send(email: OutgoingEmail) {
          sent.push(email);
          return answers[email.to] ?? 'sent';
        },
      } satisfies EmailSender,
    };
  }
  const alert = {
    subject: "Susan's Calendar alert: a Reminder failed",
    body: 'A Reminder to Susan failed.',
    opens: '/appointments/a1',
  };
  function messenger(
    answers: Record<string, EmailResult> = {},
    appUrl = 'https://calendar.example.com',
  ) {
    const email = emailService(answers);
    const m = adminMessenger({
      // Susan's account is not in the Admins group, so it is never among these.
      admins: async () => accounts('person-linda', 'person-mark', 'person-ann'),
      devices: dataApiDevices(dataApi().client),
      push: pushService().sender,
      email: email.sender,
      appUrl,
    });
    return { ...email, messenger: m };
  }

  it('go to the address each Admin named signs in with, one email each, with a link to open', async () => {
    const { messenger: m, sent } = messenger();
    await m.sendEmail(['person-linda', 'person-ann'], alert);
    expect(sent).toEqual([
      {
        to: 'linda@example.com',
        subject: alert.subject,
        body: 'A Reminder to Susan failed.\n\nhttps://calendar.example.com/appointments/a1',
      },
      {
        to: 'ann@example.com',
        subject: alert.subject,
        body: 'A Reminder to Susan failed.\n\nhttps://calendar.example.com/appointments/a1',
      },
    ]);
  });

  it('never go to anyone who is not an Admin, such as Susan', async () => {
    const { messenger: m, sent } = messenger();
    await m.sendEmail(['person-susan'], alert);
    expect(sent).toEqual([]);
  });

  it('carry no link while the app has no address of its own, as in a sandbox', async () => {
    const { messenger: m, sent } = messenger({}, 'mailto:noreply@example.com');
    await m.sendEmail(['person-mark'], alert);
    expect(sent[0].body).toBe('A Reminder to Susan failed.');
  });

  it('say what became of each one, so that only those that failed are sent again', async () => {
    const { messenger: m, sent } = messenger({
      'linda@example.com': 'rejected',
      'mark@example.com': 'failed',
    });
    expect(await m.sendEmail(['person-linda', 'person-mark', 'person-ann'], alert)).toEqual({
      sent: ['email:person-ann'],
      failed: ['email:person-mark'],
      refused: ['email:person-linda'],
    });
    expect(sent.map((email) => email.to)).toEqual([
      'linda@example.com',
      'mark@example.com',
      'ann@example.com',
    ]);
    // Asked again, leaving out what went: only the others are sent.
    expect(
      await m.sendEmail(['person-mark', 'person-ann'], alert, ['email:person-ann']),
    ).toMatchObject({ failed: ['email:person-mark'], sent: [] });
    expect(sent.map((email) => email.to).at(-1)).toBe('mark@example.com');
  });

  it('are not sent, and nothing failed, where email is not set up', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const m = adminMessenger({
      admins: async () => accounts('person-linda'),
      devices: dataApiDevices(dataApi().client),
      push: pushService().sender,
    });
    expect(await m.sendEmail(['person-linda'], alert)).toEqual({
      sent: [],
      failed: [],
      refused: [],
    });
  });
});
