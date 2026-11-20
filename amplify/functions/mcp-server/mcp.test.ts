import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  createMemoryStore,
  createStandInSender,
  type ActivityRecord,
  type Actor,
  type Appointment,
  type CalendarCore,
  type Stamp,
} from '../../../src/lib/calendar';
import { calendarCommandHandler, type CommandEvent } from '../calendar-commands/commands';
import { mcpHandler, type Account } from './http';

const TIME_ZONE = 'America/New_York';
const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };
const checkUp = { what: 'Cardiology check-up', date: '2026-11-20', time: '14:00' };
/** An Appointment's ID as the app or an agent chooses it, so that sending an add twice adds one. */
const NEW_ID = '0b9f6a52-8d1e-4b7a-9c3f-2e5d7a1c4b60';

/**
 * A calendar kept in memory on a Thursday afternoon in November, Susan's time, with its MCP server
 * as a Lambda function URL would call it, and Linda's agent key.
 */
async function calendar(
  accounts: Record<string, Account | null> = {
    'person-linda': { name: 'Linda', enabled: true },
    'person-mark': { name: 'Mark', enabled: true },
  },
) {
  const store = createMemoryStore();
  const clock = createFixedClock('2026-11-19T20:00:00.000Z');
  const messenger = createMemoryMessenger(['person-linda', 'person-mark']);
  const sender = createStandInSender();
  const core = createCalendarCore({
    store,
    clock,
    messenger,
    textSender: sender,
    timeZone: TIME_ZONE,
  });
  const account = vi.fn(async (personId: string) => accounts[personId] ?? null);
  let failing: Error | null = null;
  const handler = mcpHandler({
    core: async () => {
      if (failing) throw failing;
      return core;
    },
    account,
    clock,
    timeZone: TIME_ZONE,
  });
  const { key, hash } = await core.makeAgentKey(linda, 'Claude on my laptop');

  /** Asks the endpoint as a Lambda function URL hands it a request. */
  const ask = (init: { body?: unknown; auth?: string | null; method?: string; path?: string }) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (init.auth !== null) headers.authorization = init.auth ?? `Bearer ${key}`;
    return handler({
      rawPath: init.path ?? '/mcp',
      rawQueryString: '',
      headers,
      isBase64Encoded: false,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      requestContext: {
        domainName: 'abc.lambda-url.us-east-1.on.aws',
        http: { method: init.method ?? 'POST', sourceIp: '192.0.2.1' },
      },
    } as unknown as LambdaFunctionURLEvent);
  };

  /** A real MCP client whose HTTP requests go into the handler. */
  async function connect(auth = `Bearer ${key}`) {
    const transport = new StreamableHTTPClientTransport(
      new URL('https://abc.lambda-url.us-east-1.on.aws/mcp'),
      {
        requestInit: { headers: { authorization: auth } },
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const headers: Record<string, string> = {};
          request.headers.forEach((value, name) => (headers[name] = value));
          const answer = await handler({
            rawPath: new URL(request.url).pathname,
            rawQueryString: '',
            headers,
            isBase64Encoded: false,
            body: request.method === 'POST' ? await request.text() : undefined,
            requestContext: {
              domainName: 'abc.lambda-url.us-east-1.on.aws',
              http: { method: request.method, sourceIp: '192.0.2.1' },
            },
          } as unknown as LambdaFunctionURLEvent);
          const status = answer.statusCode ?? 200;
          const body = status === 202 || status === 204 ? null : (answer.body ?? '');
          return new Response(body, { status, headers: answer.headers });
        },
      },
    );
    const client = new Client({ name: 'test-agent', version: '1.0.0' });
    await client.connect(transport);
    return client;
  }

  /** Calls a tool and answers what it said: its JSON, or its words when it refused. */
  async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    const words = (result.content as { type: string; text: string }[])[0].text;
    return result.isError ? { refused: words } : JSON.parse(words);
  }

  return {
    store,
    clock,
    messenger,
    sender,
    core,
    key,
    hash,
    account,
    ask,
    connect,
    call,
    fail: (error: Error | null) => (failing = error),
  };
}

/** The app's own path for the same commands, as the data API calls it, signed in as Linda. */
function app(core: CalendarCore) {
  const handler = calendarCommandHandler({
    core: async () => core,
    nameOf: async () => 'Linda',
    textSender: () => 'stand-in',
  });
  return (fieldName: string, args: Record<string, unknown>) =>
    handler({
      fieldName,
      arguments: args,
      identity: { sub: 'person-linda', username: 'account-linda' },
    } as CommandEvent);
}

/** A twin calendar, at the same moment, changed only through the app. */
async function twin() {
  const store = createMemoryStore();
  const clock = createFixedClock('2026-11-19T20:00:00.000Z');
  const messenger = createMemoryMessenger(['person-linda', 'person-mark']);
  const sender = createStandInSender();
  const core = createCalendarCore({
    store,
    clock,
    messenger,
    textSender: sender,
    timeZone: TIME_ZONE,
  });
  return { store, clock, messenger, sender, core, command: app(core) };
}

/** What an Appointment holds, with the ways it was done left out: by the app or by an agent. */
const outcome = (appointment: Appointment) => {
  const plain = (stamp: Stamp | null) => stamp && { ...stamp, viaAgent: 'either' };
  const reminders = appointment.reminders.map(({ id: _, ...reminder }) => reminder);
  return {
    ...appointment,
    reminders,
    added: plain(appointment.added),
    lastChanged: plain(appointment.lastChanged),
  };
};

afterEach(() => vi.restoreAllMocks());

describe('who may use the MCP server', () => {
  it('refuses a missing, malformed, wrong or revoked key alike, and tells it nothing', async () => {
    const cal = await calendar();
    await cal.core.addAppointment(linda, { ...checkUp, privateNotes: 'Ask about the new pills.' });
    const { key: revoked, hash } = await cal.core.makeAgentKey(linda, 'Old phone');
    await cal.core.revokeAgentKey(linda, hash);
    const read = vi.spyOn(cal.core, 'appointments');
    const listing = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    const reading = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_appointments', arguments: {} },
    };

    const wrong = cal.key.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    const answers = [];
    for (const body of [listing, reading])
      for (const auth of [
        null,
        '',
        'Bearer',
        'Basic abc',
        `Bearer ${cal.key.slice(0, -1)}`,
        `Bearer ${wrong}`,
        `Bearer ${revoked}`,
        `Bearer ${cal.key}x`,
        `Bearer ${'sc_agent_' + 'x'.repeat(400)}`,
      ])
        answers.push(await cal.ask({ body, auth }));

    for (const answer of answers) {
      expect(answer).toEqual(answers[0]);
      expect(answer.statusCode).toBe(401);
      expect(answer.body).not.toMatch(/Cardiology|pills|Linda|tools/);
    }
    expect(answers[0].headers['www-authenticate']).toMatch(/^Bearer /);
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a key whose person's account is disabled or gone, alike", async () => {
    for (const account of [{ name: 'Linda', enabled: false }, null]) {
      const cal = await calendar({ 'person-linda': account });
      const missing = await cal.ask({ body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
      const none = await cal.ask({
        body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        auth: null,
      });
      expect(missing).toEqual(none);
    }
  });

  it('works for a working key, and stops working once it is revoked', async () => {
    const cal = await calendar();
    const client = await cal.connect();
    expect(client.getServerVersion()?.name).toBe('susans-calendar');
    expect(await cal.call(client, 'list_appointments')).toMatchObject({ appointments: [] });
    await cal.core.revokeAgentKey(linda, cal.hash);
    await expect(cal.call(client, 'list_appointments')).rejects.toThrow();
  });

  it('serves only its own address, by POST, and turns away a request too large to read', async () => {
    const cal = await calendar();
    const listing = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    expect(await cal.ask({ body: listing, path: '/' })).toMatchObject({ statusCode: 404 });
    expect(await cal.ask({ body: listing, path: '/mcp/tools' })).toMatchObject({
      statusCode: 404,
    });
    for (const method of ['GET', 'DELETE', 'PUT'])
      expect(await cal.ask({ method })).toMatchObject({
        statusCode: 405,
        headers: { allow: 'POST' },
      });
    const owner = vi.spyOn(cal.core, 'agentKeyOwner');
    const large = { padding: 'x'.repeat(1_000_001) };
    // The same answer whatever key comes with it.
    for (const auth of [undefined, null, `Bearer ${'sc_agent_' + 'A'.repeat(43)}`])
      expect(await cal.ask({ body: large, auth })).toMatchObject({ statusCode: 413 });
    expect(owner).not.toHaveBeenCalled();
  });

  it('says nothing of the key or the calendar when it fails, and logs only fixed words', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cal = await calendar();
    cal.fail(new Error(`The data API is not answering about ${cal.key}`));
    const answer = await cal.ask({ body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
    expect(answer.statusCode).toBe(503);
    expect(answer.body).not.toContain(cal.key);
    const words = logged.mock.calls.flat().join(' ');
    expect(words).toBe('MCP server failed (data)');
  });
});

describe('the tools an agent is given', () => {
  it('cover reading and changing Appointments, Series and their Reminders, and texts', async () => {
    const cal = await calendar();
    const { tools } = await (await cal.connect()).listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        'list_appointments',
        'get_appointment',
        'list_texts',
        'list_series',
        'get_series',
        'add_appointment',
        'change_appointment',
        'cancel_appointment',
        'delete_appointment',
        'add_series',
        'change_series',
        'end_series',
      ].sort(),
    );
    const reading = ['list_appointments', 'get_appointment', 'list_texts', 'list_series'];
    for (const tool of tools)
      expect(tool.annotations?.readOnlyHint).toBe(
        reading.includes(tool.name) || tool.name === 'get_series',
      );
  });

  it('refuse a call whose arguments do not fit, before the calendar is asked', async () => {
    const cal = await calendar();
    const client = await cal.connect();
    const add = vi.spyOn(cal.core, 'addAppointment');
    for (const args of [
      { date: '2026-11-20', time: '14:00' },
      { ...checkUp, what: 42 },
    ]) {
      const said = await cal.call(client, 'add_appointment', args);
      expect(said.refused).toMatch(/what/);
    }
    expect(add).not.toHaveBeenCalled();
    expect(cal.store.appointments()).toEqual([]);
  });

  it('expose no settings, keys, subscription links or accounts', async () => {
    const cal = await calendar();
    const client = await cal.connect();
    const { tools } = await client.listTools();
    /** Every name a tool or one of its inputs has, however deep. */
    const names = (schema: unknown): string[] => {
      if (typeof schema !== 'object' || schema === null) return [];
      const { properties = {}, items } = schema as { properties?: object; items?: unknown };
      return [
        ...Object.keys(properties),
        ...Object.values(properties).flatMap(names),
        ...names(items),
      ];
    };
    const named = tools.flatMap((tool) => [tool.name, ...names(tool.inputSchema)]);
    expect(named.length).toBeGreaterThan(tools.length);
    for (const name of named)
      expect(name).not.toMatch(/setting|key|subscription|link|account|number|phone|person|user/i);
    // No resources or prompts beside the tools.
    expect(client.getServerCapabilities()).not.toHaveProperty('resources');
    expect(client.getServerCapabilities()).not.toHaveProperty('prompts');
  });

  it("each say that every time is Susan's local time, and that moving one she was reminded of texts her", async () => {
    const cal = await calendar();
    const { tools } = await (await cal.connect()).listTools();
    for (const tool of tools) {
      expect(tool.description).toContain("All dates and times are Susan's local time");
      expect(tool.description).toContain(TIME_ZONE);
      expect(tool.description).toContain(
        'Moving or cancelling an Appointment Susan has already been reminded of sends her a text',
      );
    }
  });
});

describe('reading the calendar through the tools', () => {
  it("lists Appointments from today on, in Susan's local time, and reads one in full", async () => {
    const cal = await calendar();
    const added = await cal.core.addAppointment(linda, {
      ...checkUp,
      withWhom: 'Dr. Patel',
      privateNotes: 'Ask about the new pills.',
    });
    await cal.core.addAppointment(linda, { what: 'Flu shot', date: '2026-11-12', time: '10:30' });
    const later = await cal.core.addAppointment(linda, {
      what: 'Blood draw',
      date: '2026-12-01',
      time: '09:00',
    });
    await cal.core.cancelAppointment(linda, later.id);
    const client = await cal.connect();

    const upcoming = await cal.call(client, 'list_appointments');
    expect(upcoming.today).toBe('2026-11-19');
    expect(upcoming.appointments).toMatchObject([
      {
        id: added.id,
        what: 'Cardiology check-up',
        date: '2026-11-20',
        day: 'Friday, November 20, 2026',
        time: '14:00',
        withWhom: 'Dr. Patel',
        state: 'active',
        reminders: [{ shape: 'daysBefore', days: 1, time: '18:00', goesOutAt: '2026-11-19 18:00' }],
        added: { by: 'Linda', viaAgent: false, at: '2026-11-19 15:00' },
      },
    ]);
    // Who did something is said by name only: no account is named.
    expect(JSON.stringify(upcoming)).not.toContain('person-linda');

    const all = await cal.call(client, 'list_appointments', {
      from: '2026-11-01',
      to: '2026-12-31',
      includeCancelled: true,
    });
    expect(all.appointments.map((each: Appointment) => [each.what, each.state])).toEqual([
      ['Flu shot', 'active'],
      ['Cardiology check-up', 'active'],
      ['Blood draw', 'cancelled'],
    ]);

    expect(await cal.call(client, 'get_appointment', { id: added.id })).toMatchObject({
      what: 'Cardiology check-up',
      privateNotes: 'Ask about the new pills.',
    });
    expect(await cal.call(client, 'get_appointment', { id: 'no-such-appointment' })).toEqual({
      refused: 'That Appointment is not in the calendar. It may have been deleted.',
    });
  });

  it('reads whether the texts about an Appointment were sent and delivered', async () => {
    const cal = await calendar();
    const added = await cal.core.addAppointment(linda, checkUp);
    await cal.core.changeSettings(linda, { susansNumber: '+15555550123' });
    cal.clock.set(added.reminders[0].dueAt);
    await cal.core.runDue();
    const client = await cal.connect();
    const { texts } = await cal.call(client, 'list_texts', { appointmentId: added.id });
    expect(texts).toEqual([
      {
        kind: 'Reminder',
        reminderId: added.reminders[0].id,
        due: '2026-11-19 18:00',
        status: 'Sent',
        detail: 'Thu, Nov 19, 2026 at 6:00 pm',
        sentAt: '2026-11-19 18:00',
        words: expect.stringMatching(/^Susan's Calendar: Cardiology check-up/),
      },
    ]);
    // Nothing about where texts go.
    expect(JSON.stringify(texts)).not.toContain('5550123');
  });

  it('lists the Series and reads one', async () => {
    const cal = await calendar();
    const { series } = await cal.core.addSeries(linda, {
      what: 'Dialysis',
      date: '2026-11-23',
      time: '09:00',
      repeat: { every: 'week', weekdays: [0, 3] },
    });
    const client = await cal.connect();
    expect(await cal.call(client, 'list_series')).toMatchObject({
      series: [
        {
          id: series.id,
          what: 'Dialysis',
          time: '09:00',
          repeats: 'Every week on Monday and Thursday',
          starts: '2026-11-23',
          ends: null,
        },
      ],
    });
    expect(await cal.call(client, 'get_series', { id: series.id })).toMatchObject({
      id: series.id,
      reminders: [{ shape: 'daysBefore', days: 1, time: '18:00' }],
    });
  });
});

describe('changing the calendar through the tools', () => {
  it("is done as the key's person, via agent, and the other Admins are told it was their agent", async () => {
    const cal = await calendar();
    const client = await cal.connect();
    const added = await cal.call(client, 'add_appointment', { ...checkUp });
    expect(added.added).toEqual({ by: 'Linda', viaAgent: true, at: '2026-11-19 15:00' });
    const [kept] = cal.store.appointments();
    expect(kept.added).toEqual({
      personId: 'person-linda',
      personName: 'Linda',
      viaAgent: true,
      at: '2026-11-19T20:00:00.000Z',
    });
    cal.clock.set('2026-11-19T21:00:00.000Z');
    await cal.call(client, 'change_appointment', { id: kept.id, time: '15:30' });
    expect(cal.store.appointments()[0].lastChanged).toMatchObject({
      personName: 'Linda',
      viaAgent: true,
    });
    expect(cal.store.activity()).toMatchObject([
      { action: 'added', personId: 'person-linda', viaAgent: true },
      { action: 'changed', personId: 'person-linda', viaAgent: true },
    ]);
    // Linda is not told of her own agent's changes; Mark is.
    expect(cal.messenger.appNotifications()).toMatchObject([
      {
        to: ['person-mark'],
        notification: {
          body: "Linda's agent added Cardiology check-up, Fri, Nov 20, 2026 at 2:00 pm.",
        },
      },
      {
        to: ['person-mark'],
        notification: {
          body: "Linda's agent changed Cardiology check-up, Fri, Nov 20, 2026 at 3:30 pm: the start time (was 2:00 pm).",
        },
      },
    ]);
  });

  it('takes the name the person has now, from their account', async () => {
    const cal = await calendar({ 'person-linda': { name: 'Linda R.', enabled: true } });
    const client = await cal.connect();
    await cal.call(client, 'add_appointment', checkUp);
    expect(cal.store.appointments()[0].added.personName).toBe('Linda R.');
  });

  it('comes to the same as the same changes made in the app', async () => {
    const agent = await calendar();
    const inApp = await twin();
    const client = await agent.connect();
    const details = {
      ...checkUp,
      withWhom: 'Dr. Patel',
      driverName: 'Mark',
      pickupTime: '13:15',
      reminders: [
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'before', amount: 2, unit: 'hours' },
      ],
    };

    await agent.call(client, 'add_appointment', { id: NEW_ID, ...details });
    await inApp.command('addAppointment', { id: NEW_ID, details: JSON.stringify(details) });
    for (const { clock } of [agent, inApp]) clock.set('2026-11-19T21:00:00.000Z');
    const changes = {
      time: '15:00',
      placeName: 'Heart Clinic',
      reminders: [{ shape: 'at', date: '2026-11-20', time: '09:00' }],
    };
    await agent.call(client, 'change_appointment', { id: NEW_ID, ...changes });
    await inApp.command('changeAppointment', { id: NEW_ID, changes: JSON.stringify(changes) });
    const second = { ...checkUp, what: 'Eye exam', date: '2026-11-24' };
    const eye = await agent.call(client, 'add_appointment', second);
    const eyeInApp = (await inApp.command('addAppointment', {
      details: JSON.stringify(second),
    })) as { appointment: Appointment };
    await agent.call(client, 'cancel_appointment', { id: eye.id });
    await inApp.command('cancelAppointment', { id: eyeInApp.appointment.id });
    // A Series, added with its ID, changed from its third Appointment on, then one changed alone.
    const SERIES_ID = '7c1d2e3f-4a5b-4c6d-8e7f-901a2b3c4d5e';
    const dialysis = {
      what: 'Dialysis',
      date: '2026-11-23',
      time: '09:00',
      repeat: { every: 'week', weekdays: [0, 3] },
      ends: '2026-12-31',
    };
    await agent.call(client, 'add_series', { id: SERIES_ID, ...dialysis });
    await inApp.command('addSeries', { id: SERIES_ID, details: JSON.stringify(dialysis) });
    const third = agent.store.appointments().filter((each) => each.series)[2];
    const fromThird = { time: '10:00', placeName: 'Unit B' };
    await agent.call(client, 'change_series', { id: third.id, ...fromThird });
    await inApp.command('changeSeries', { id: third.id, changes: JSON.stringify(fromThird) });
    const first = agent.store.appointments().find((each) => each.series)!;
    await agent.call(client, 'change_appointment', { id: first.id, driverName: 'Ann' });
    await inApp.command('changeAppointment', {
      id: first.id,
      changes: JSON.stringify({ driverName: 'Ann' }),
    });

    const ids = new Map([[eyeInApp.appointment.id, eye.id]]);
    // A continued Series is made with an ID of its own each way; it is matched by its first date.
    const seriesIds = (store: typeof agent.store) =>
      new Map(store.everySeriesKept().map((each) => [each.id, each.starts]));
    const agentSeries = seriesIds(agent.store);
    const appSeries = seriesIds(inApp.store);
    const sameSeries = (appointment: Appointment, named: Map<string, string>) =>
      appointment.series && {
        ...appointment.series,
        id: named.get(appointment.series.id),
      };
    const mine = (appointment: Appointment) => ({
      ...outcome(appointment),
      series: sameSeries(appointment, agentSeries),
    });
    const same = (appointment: Appointment) => ({
      ...outcome(appointment),
      id: ids.get(appointment.id) ?? appointment.id,
      series: sameSeries(appointment, appSeries),
    });
    expect(agent.store.appointments().length).toBeGreaterThan(10);
    expect(agent.store.appointments().map(mine)).toEqual(inApp.store.appointments().map(same));
    const record = ({ id: _, appointmentId: __, seriesId, ...each }: ActivityRecord) => ({
      ...each,
      inSeries: seriesId !== null,
    });
    expect(agent.store.activity().map(record)).toEqual(
      inApp.store.activity().map((each) => ({ ...record(each), viaAgent: true })),
    );
    // The same Activity updates, but for who did it.
    expect(
      agent.messenger.appNotifications().map(({ to, notification }) => [to, notification.body]),
    ).toEqual(
      inApp.messenger
        .appNotifications()
        .map(({ to, notification }) => [
          to,
          notification.body.replace(/^Linda /, "Linda's agent "),
        ]),
    );

    // And the same texts to Susan, when they come due.
    for (const { core, clock } of [agent, inApp]) {
      await core.changeSettings(linda, { susansNumber: '+15555550123' });
      clock.set('2026-11-20T14:00:00.000Z');
      await core.runDue();
    }
    expect(agent.sender.taken()).toEqual(inApp.sender.taken());
    expect(agent.sender.taken()).toHaveLength(1);
  });

  it("is refused for the same reasons as in the app, in the core's own words", async () => {
    const agent = await calendar();
    const inApp = await twin();
    const client = await agent.connect();
    const late = { ...checkUp, reminders: [{ shape: 'at', date: '2026-11-20', time: '15:00' }] };
    const refusal = (await inApp.command('addAppointment', {
      details: JSON.stringify(late),
    })) as { refusal: { message: string } };
    expect(await agent.call(client, 'add_appointment', late)).toEqual({
      refused: refusal.refusal.message,
    });
    expect(agent.store.appointments()).toEqual([]);
    expect(agent.store.activity()).toEqual([]);

    // Deleting one Susan has been texted about.
    const added = await agent.call(client, 'add_appointment', checkUp);
    await agent.core.changeSettings(linda, { susansNumber: '+15555550123' });
    agent.clock.set('2026-11-19T23:00:00.000Z');
    await agent.core.runDue();
    expect(await agent.call(client, 'delete_appointment', { id: added.id })).toEqual({
      refused:
        'Susan has already been texted about this Appointment, so it cannot be deleted. Cancel it instead.',
    });
  });

  it('sets Reminders, and confirms one held for review, as a person does', async () => {
    const cal = await calendar();
    const client = await cal.connect();
    const added = await cal.call(client, 'add_appointment', {
      ...checkUp,
      reminders: [{ shape: 'at', date: '2026-11-20', time: '09:00' }],
    });
    const moved = await cal.call(client, 'change_appointment', {
      id: added.id,
      date: '2026-11-21',
    });
    expect(moved.reminders).toMatchObject([{ shape: 'at', needsReview: true }]);
    const confirmed = await cal.call(client, 'change_appointment', {
      id: added.id,
      reminders: [{ ...moved.reminders[0], reviewed: true }],
    });
    expect(confirmed.reminders).toMatchObject([
      { id: moved.reminders[0].id, needsReview: false, goesOutAt: '2026-11-20 09:00' },
    ]);
    const none = await cal.call(client, 'change_appointment', { id: added.id, reminders: [] });
    expect(none.reminders).toEqual([]);
  });

  it('carries out an add sent twice once, given its ID', async () => {
    const cal = await calendar();
    const client = await cal.connect();
    await cal.call(client, 'add_appointment', { id: NEW_ID, ...checkUp });
    await cal.call(client, 'add_appointment', { id: NEW_ID, ...checkUp });
    expect(cal.store.appointments()).toHaveLength(1);
    expect(cal.store.activity()).toHaveLength(1);
  });

  it('adds, changes from one on, and ends a Series, with one Activity update each', async () => {
    const cal = await calendar();
    const client = await cal.connect();
    const first = await cal.call(client, 'add_series', {
      what: 'Dialysis',
      date: '2026-11-23',
      time: '09:00',
      repeat: { every: 'week', weekdays: [0, 3] },
      ends: '2026-12-31',
    });
    expect(first).toMatchObject({ date: '2026-11-23', series: { repeats: expect.any(String) } });
    const series = cal.store.everySeriesKept()[0];
    expect(series.added).toMatchObject({ personName: 'Linda', viaAgent: true });
    const third = cal.store.appointments()[2];
    const changed = await cal.call(client, 'change_series', { id: third.id, time: '10:00' });
    expect(changed).toMatchObject({ date: third.date, time: '10:00' });
    expect(cal.store.appointments()[1].time).toBe('09:00');
    const fifth = cal.store.appointments()[4];
    expect(await cal.call(client, 'end_series', { id: fifth.id })).toMatchObject({
      state: 'cancelled',
    });
    expect(cal.store.appointments().at(-1)?.state).toBe('cancelled');
    expect(cal.store.appointments()[3].state).toBe('active');
    expect(cal.messenger.appNotifications().map(({ notification }) => notification.body)).toEqual([
      expect.stringMatching(/^Linda's agent added a Series: Dialysis/),
      expect.stringMatching(/^Linda's agent changed Dialysis from .* on/),
      expect.stringMatching(/^Linda's agent cancelled Dialysis from .* on/),
    ]);
    // Only this one, in a Series.
    const sixth = cal.store.appointments()[1];
    expect(
      await cal.call(client, 'change_appointment', { id: sixth.id, placeName: 'Unit B' }),
    ).toMatchObject({ placeName: 'Unit B', series: { individuallyChanged: true } });
  });

  it('logs a failure in fixed words, and tells the agent only to try again', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cal = await calendar();
    const client = await cal.connect();
    vi.spyOn(cal.core, 'addAppointment').mockRejectedValue(
      new TypeError('Cannot read Cardiology check-up'),
    );
    expect(await cal.call(client, 'add_appointment', checkUp)).toEqual({
      refused: 'The calendar could not be read or changed just now. Try again in a minute.',
    });
    expect(logged.mock.calls.flat().join(' ')).toBe('MCP tool add_appointment failed (code)');
  });
});
