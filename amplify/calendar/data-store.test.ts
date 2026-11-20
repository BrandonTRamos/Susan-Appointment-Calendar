import { describe, expect, it, vi } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  type Actor,
  type Appointment,
  createStandInSender,
  NO_ADMIN_MESSENGER,
  NO_TEXT_SENDER,
} from '../../src/lib/calendar';
import { MCP_SERVER_FIELDS } from '../functions/mcp-server/access';
import { SERIES_TOP_UP_FIELDS } from '../functions/series-top-up/access';
import { dataStore, type DataClient } from './data-store';

type Row = Record<string, unknown> & { id: string };

/**
 * Stands in for the data API: keeps rows the way it does, adding its own fields beside them, and
 * answers every call with `{ data, errors }`.
 */
function dataApi() {
  const tables = {
    Appointment: new Map<string, Row>(),
    Series: new Map<string, Row>(),
    ActivityRecord: new Map<string, Row>(),
    Text: new Map<string, Row>(),
    CalendarSettings: new Map<string, Row>(),
    Reply: new Map<string, Row>(),
    CalendarAlert: new Map<string, Row>(),
  };
  const seen = new Map<string, Row>();
  const conditionFailed = () => ({
    data: null,
    errors: [
      {
        errorType: 'DynamoDB:ConditionalCheckFailedException',
        message: 'The conditional request failed (Service: DynamoDb, Status Code: 400)',
      },
    ],
  });
  let failure: string | null = null;
  const answer = <T>(data: T) =>
    failure ? { data: null, errors: [{ message: failure }] } : { data };
  /**
   * `removesNulls`: an update removes a field given as null, as the data API's own does; the
   * settings' destination ID relies on it. The other models' tests keep nulls as written.
   */
  const model = (rows: Map<string, Row>, removesNulls = false) => ({
    async get({ id }: { id: string }) {
      return answer(rows.get(id) ?? null);
    },
    // Two rows to a page, so that reading every row takes more than one.
    async list({ nextToken }: { nextToken?: string | null } = {}) {
      const from = Number(nextToken ?? 0);
      const page = [...rows.values()].slice(from, from + 2);
      const more = from + 2 < rows.size;
      return { ...answer(page), nextToken: more ? String(from + 2) : null };
    },
    // As the data API's own create does: only if no row has the ID, in one step.
    async create(input: Row) {
      if (failure) return answer(null);
      if (rows.has(input.id))
        return {
          data: null,
          errors: [
            {
              errorType: 'DynamoDB:ConditionalCheckFailedException',
              message: 'The conditional request failed (Service: DynamoDb, Status Code: 400)',
            },
          ],
        };
      const row = {
        ...input,
        createdAt: '2026-11-19T20:00:01.000Z',
        updatedAt: '2026-11-19T20:00:01.000Z',
      };
      rows.set(input.id, row);
      return answer(row);
    },
    // As the data API's own update does: only the fields given are written.
    async update(input: Row) {
      if (failure) return answer(null);
      const row: Row = { ...rows.get(input.id)!, ...input, updatedAt: '2026-11-19T21:00:01.000Z' };
      if (removesNulls)
        for (const [field, value] of Object.entries(input)) if (value === null) delete row[field];
      rows.set(input.id, row);
      return answer(row);
    },
    async delete({ id }: { id: string }) {
      if (failure) return answer(null);
      const row = rows.get(id) ?? null;
      rows.delete(id);
      return answer(row);
    },
  });
  // Kept by person, and found by hash through an index that can lag behind the table.
  const links = new Map<string, Row>();
  let index: Row[] | null = null;
  const SubscriptionLink = {
    async get({ personId }: { personId: string }) {
      return answer(links.get(personId) ?? null);
    },
    async create(input: Row) {
      if (failure || links.has(input.personId as string)) return answer(null);
      links.set(input.personId as string, { ...input, createdAt: 'x', updatedAt: 'x' });
      return answer(links.get(input.personId as string));
    },
    async update(input: Row) {
      if (failure || !links.has(input.personId as string)) return answer(null);
      links.set(input.personId as string, { ...links.get(input.personId as string), ...input });
      return answer(links.get(input.personId as string));
    },
    async delete({ personId }: { personId: string }) {
      if (failure) return answer(null);
      const row = links.get(personId) ?? null;
      links.delete(personId);
      return answer(row);
    },
    async subscriptionLinkByHash({ hash }: { hash: string }) {
      return answer((index ?? [...links.values()]).filter((row) => row.hash === hash));
    },
  };
  // Kept by hash. Its reads, like the data API's, can lag behind what was written.
  const agentKeys = new Map<string, Row>();
  let keyReads: Map<string, Row> | null = null;
  const AgentKey = {
    async get({ hash }: { hash: string }) {
      return answer((keyReads ?? agentKeys).get(hash) ?? null);
    },
    async create(input: Row) {
      if (failure || agentKeys.has(input.hash as string)) return answer(null);
      agentKeys.set(input.hash as string, { ...input, createdAt: 'x', updatedAt: 'x' });
      return answer(agentKeys.get(input.hash as string));
    },
  };
  const refusedCondition = {
    data: null,
    errors: [
      {
        errorType: 'DynamoDB:ConditionalCheckFailedException',
        message: 'The conditional request failed (Service: DynamoDb, Status Code: 400)',
      },
    ],
  };
  const client = {
    models: {
      AgentKey,
      Appointment: model(tables.Appointment),
      Series: model(tables.Series),
      ActivityRecord: model(tables.ActivityRecord),
      SubscriptionLink,
      Text: {
        ...model(tables.Text),
        async textsByAppointment({ appointmentId }: { appointmentId: string }) {
          const rows = [...tables.Text.values()].filter(
            (row) => row.appointmentId === appointmentId,
          );
          return { ...answer(rows), nextToken: null };
        },
      },
      CalendarSettings: model(tables.CalendarSettings, true),
      Reply: model(tables.Reply),
      CalendarAlert: model(tables.CalendarAlert),
      RepliesSeen: {
        async get({ personId }: { personId: string }) {
          return answer(seen.get(personId) ?? null);
        },
        // As the data API's own create does: only if the person has no mark yet, in one step.
        async create(input: Row) {
          if (seen.has(input.personId as string)) return conditionFailed();
          seen.set(input.personId as string, input);
          return answer(input);
        },
      },
    },
    // Only the conditional update of a text, a Reply or a calendar Alert, as DynamoDB checks it:
    // every `eq` in the condition must hold of the row as it is when written. The client throws
    // an answer that has errors.
    async graphql({ query, variables }: { query: string; variables: Record<string, unknown> }) {
      // A key is deleted only if, as DynamoDB deletes it, it is there and the condition holds of it.
      if (query.includes('deleteAgentKey(input: { hash: $hash }, condition: $condition)')) {
        if (failure) throw { data: null, errors: [{ message: failure }] };
        const hash = variables.hash as string;
        const { personId } = variables.condition as { personId: { eq: unknown } };
        const row = agentKeys.get(hash);
        if (!row || row.personId !== personId.eq) throw refusedCondition;
        agentKeys.delete(hash);
        return { data: { deleteAgentKey: { hash } } };
      }
      // Susan's number given its destination ID: only while the kept number is the one confirmed
      // and has none, as DynamoDB checks `eq` and `attributeExists` when it writes.
      if (query.includes('updateCalendarSettings(input: $input, condition: $condition)')) {
        const input = variables.input as Row;
        const { and } = variables.condition as {
          and: Record<string, { eq?: unknown; attributeExists?: boolean }>[];
        };
        const row = tables.CalendarSettings.get(input.id);
        const holds =
          row &&
          and.every((each) =>
            Object.entries(each).every(([field, test]) =>
              'attributeExists' in test
                ? (field in row && row[field] !== undefined) === test.attributeExists
                : row[field] === test.eq,
            ),
          );
        if (!holds) throw conditionFailed();
        tables.CalendarSettings.set(input.id, { ...row, ...input });
        return { data: { updateCalendarSettings: { id: input.id } } };
      }
      // A person's mark of the Replies seen: moved on only while the kept one is earlier.
      if (query.includes('updateRepliesSeen(input: $input, condition: $condition)')) {
        const input = variables.input as Row;
        const { and } = variables.condition as { and: Record<string, { lt: string }>[] };
        const row = seen.get(input.personId as string);
        if (!row || !and.every((each) => (row.seenUpTo as string) < each.seenUpTo.lt))
          throw conditionFailed();
        seen.set(input.personId as string, { ...row, ...input });
        return { data: { updateRepliesSeen: { personId: input.personId } } };
      }
      const model =
        /update(Text|Reply|CalendarAlert)\(input: \$input, condition: \$condition\)/.exec(
          query,
        )?.[1] as 'Text' | 'Reply' | 'CalendarAlert' | undefined;
      if (!model) throw new Error('This stand-in only answers conditional writes.');
      const input = variables.input as Row;
      const { and } = variables.condition as { and: Record<string, { eq: unknown }>[] };
      const row = tables[model].get(input.id);
      const holds =
        row && and.every((each) => Object.entries(each).every(([f, { eq }]) => row[f] === eq));
      if (!holds)
        throw {
          data: null,
          errors: [
            {
              errorType: 'DynamoDB:ConditionalCheckFailedException',
              message: 'The conditional request failed (Service: DynamoDb, Status Code: 400)',
            },
          ],
        };
      tables[model].set(input.id, { ...row, ...input });
      return { data: { [`update${model}`]: { id: input.id } } };
    },
  } as unknown as DataClient;
  return {
    client,
    appointments: () => [...tables.Appointment.values()],
    series: () => [...tables.Series.values()],
    activity: () => [...tables.ActivityRecord.values()],
    links: () => [...links.values()],
    agentKeys: () => [...agentKeys.values()],
    texts: () => [...tables.Text.values()],
    replies: () => [...tables.Reply.values()],
    settingsRows: () => [...tables.CalendarSettings.values()],
    /** Puts a row of settings in as one kept before a field existed. */
    keepSettingsRow(row: Row) {
      tables.CalendarSettings.set(row.id, row);
    },
    calendarAlerts: () => [...tables.CalendarAlert.values()],
    /** The index stops hearing of changes until it is told to catch up. */
    freezeIndex() {
      index = structuredClone([...links.values()]);
    },
    /** Reads of agent keys stop hearing of changes, as a lagging read would. */
    freezeKeyReads() {
      keyReads = structuredClone(agentKeys);
    },
    failWith(message: string | null) {
      failure = message;
    },
  };
}

const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };
const checkUp = { what: 'Cardiology check-up', date: '2026-11-20', time: '14:00' };

type Fields = Record<'Query' | 'Mutation', string[]>;

/**
 * The data API as a function whose role may call only these fields sees it: any other answers as
 * AppSync does, not authorized. Each model call is named by the field it is in the data API.
 */
function limitedTo(client: DataClient, allowed: Fields): DataClient {
  const may = new Set([...allowed.Query, ...allowed.Mutation]);
  const fieldOf = (model: string, call: string) =>
    ({
      get: `get${model}`,
      list: model.endsWith('s') ? `list${model}` : `list${model}s`,
      create: `create${model}`,
      update: `update${model}`,
      delete: `delete${model}`,
    })[call] ?? call;
  const refused = (field: string) => ({
    data: null,
    errors: [{ errorType: 'Unauthorized', message: `Not Authorized to access ${field}` }],
  });
  type Calls = Record<string, (...args: unknown[]) => unknown>;
  const all = client.models as unknown as Record<string, Calls>;
  const models = Object.fromEntries(
    Object.entries(all).map(([model, calls]) => [
      model,
      Object.fromEntries(
        Object.entries(calls).map(([call, run]) => [
          call,
          async (...args: unknown[]) =>
            may.has(fieldOf(model, call)) ? run(...args) : refused(fieldOf(model, call)),
        ]),
      ),
    ]),
  );
  const graphql = async () => {
    throw refused('a custom operation');
  };
  return { ...client, models, graphql } as unknown as DataClient;
}

function calendar() {
  const api = dataApi();
  const store = dataStore(api.client);
  const core = createCalendarCore({
    store,
    clock: createFixedClock('2026-11-19T20:00:00.000Z'),
    messenger: createMemoryMessenger(),
    textSender: createStandInSender(),
    timeZone: 'America/New_York',
  });
  return { api, store, core };
}

describe('the calendar kept in the data API', () => {
  it('holds an Appointment as the core made it, and hands the same one back', async () => {
    const { api, store, core } = calendar();
    const added = await core.addAppointment(linda, {
      ...checkUp,
      withWhom: 'Dr. Patel',
      noteForSusan: 'Bring your list of medicines.',
    });
    expect(api.appointments()).toMatchObject([added]);
    // The data API's own fields are not part of an Appointment.
    expect(await store.appointment(added.id)).toEqual(added);
    expect(await store.appointment('no-such-appointment')).toBeNull();
  });

  it('carries a change, a cleared detail and a cancellation', async () => {
    const { api, store, core } = calendar();
    const { id } = await core.addAppointment(linda, { ...checkUp, driverName: 'Mark' });
    await core.changeAppointment(linda, id, { time: '15:30', driverName: null });
    const cancelled = await core.cancelAppointment(linda, id);
    expect(api.appointments()).toHaveLength(1);
    expect(api.appointments()[0]).toMatchObject({
      id,
      time: '15:30',
      driverName: null,
      startsAt: '2026-11-20T20:30:00.000Z',
      state: 'cancelled',
    });
    expect(await store.appointment(id)).toEqual(cancelled);
  });

  it('does not undo a cancellation that lands while a change is being made', async () => {
    const { api, store, core } = calendar();
    const added = await core.addAppointment(linda, { ...checkUp, driverName: 'Mark' });
    // Linda's change has read the Appointment. Before it writes, Mark cancels it and names
    // another Driver, from his own phone.
    const read = (await store.appointment(added.id))!;
    Object.assign(api.appointments()[0], { state: 'cancelled', driverName: 'Linda' });
    await store.replaceAppointment({
      ...read,
      time: '15:30',
      startsAt: '2026-11-20T20:30:00.000Z',
    });
    expect(api.appointments()[0]).toMatchObject({
      time: '15:30',
      startsAt: '2026-11-20T20:30:00.000Z',
      state: 'cancelled',
      driverName: 'Linda',
    });
  });

  it('removes a deleted Appointment and keeps the record of it', async () => {
    const { api, core } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    await core.deleteAppointment(linda, id);
    expect(api.appointments()).toEqual([]);
    expect(api.activity()).toMatchObject([
      { action: 'added', appointmentId: id, personName: 'Linda', viaAgent: false },
      { action: 'deleted', appointmentId: id, what: 'Cardiology check-up' },
    ]);
  });

  it('holds a Series and its Appointments, and hands them back as they were', async () => {
    const { api, store, core } = calendar();
    const { series, appointments } = await core.addSeries(linda, {
      what: 'Dialysis',
      date: '2026-11-23',
      time: '09:00',
      repeat: { every: 'week', weekdays: [0, 3] },
      ends: '2026-12-31',
      reminders: [{ shape: 'before', amount: 2, unit: 'hours' }],
    });
    expect(api.series()).toHaveLength(1);
    expect(await store.series(series.id)).toEqual(series);
    expect(await store.everySeries()).toEqual([series]);
    expect(await store.appointment(appointments[3].id)).toEqual(appointments[3]);
    expect(api.activity()).toMatchObject([{ action: 'added', seriesId: series.id }]);
  });

  it('carries a change to this and all later ones, and ending a Series', async () => {
    const { api, store, core } = calendar();
    const { series, appointments } = await core.addSeries(linda, {
      what: 'Dialysis',
      date: '2026-11-23',
      time: '09:00',
      repeat: { every: 'week', weekdays: [0, 3] },
      ends: '2026-12-31',
    });
    const changed = await core.changeSeries(linda, appointments[2].id, { time: '10:00' });
    expect(api.series()).toHaveLength(2);
    expect(await store.series(series.id)).toMatchObject({ ends: '2026-11-29' });
    const rows = api
      .appointments()
      .filter((row) => (row.series as { id: string }).id === changed.series!.id);
    expect(rows.every((row) => row.time === '10:00')).toBe(true);
    await core.endSeries(linda, appointments[4].id);
    expect(await store.series(changed.series!.id)).toMatchObject({ ends: '2026-12-06' });
    expect(api.appointments().find((row) => row.id === appointments[4].id)).toMatchObject({
      state: 'cancelled',
    });
  });

  it('lets the Series top-up, with only its own fields, undo what it made past an end set as it ran', async () => {
    const api = dataApi();
    const clock = createFixedClock('2026-11-19T20:00:00.000Z');
    const timeZone = 'America/New_York';
    const commands = createCalendarCore({
      store: dataStore(api.client),
      clock,
      messenger: createMemoryMessenger(),
      textSender: createStandInSender(),
      timeZone,
    });
    // The top-up's own data API, as its role sees it, paused at its first new Appointment while
    // the Series is ended from the Appointment before.
    let pause: (() => Promise<unknown>) | null = null;
    const limited = limitedTo(api.client, SERIES_TOP_UP_FIELDS);
    const appointmentCalls = limited.models.Appointment as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;
    const create = appointmentCalls.create;
    appointmentCalls.create = async (...args) => {
      const waiting = pause;
      pause = null;
      await waiting?.();
      return create(...args);
    };
    const topUp = createCalendarCore({
      store: dataStore(limited),
      clock,
      messenger: NO_ADMIN_MESSENGER,
      textSender: NO_TEXT_SENDER,
      timeZone,
    });

    const { series, appointments } = await commands.addSeries(linda, {
      what: 'Dialysis',
      date: '2026-11-23',
      time: '09:00',
      repeat: { every: 'week', weekdays: [0, 3] },
    });
    // Say a text about the first Appointment the top-up will make has reached Susan: that one
    // must be kept, cancelled, and never deleted.
    const texted = `${series.id}-2027-05-27`;
    api.client.models.Text.create({
      id: `reminder:${texted}`,
      kind: 'reminder',
      appointmentId: texted,
      reminderId: 'reminder-1',
      words: "Susan's Calendar: Dialysis.",
      dueAt: '2027-05-26T22:00:00.000Z',
      status: 'sent',
      attempts: 1,
      triedAt: '2027-05-26T22:00:00.000Z',
    } as never);

    clock.set('2027-02-01T20:00:00.000Z');
    pause = () => commands.endSeries(linda, appointments[3].id);
    await topUp.topUpSeries();

    expect(api.series()[0]).toMatchObject({ ends: '2026-12-02' });
    const mine = api
      .appointments()
      .filter((row) => (row.series as { id: string } | null)?.id === series.id);
    const past = mine.filter((row) => (row.date as string) > '2026-12-02');
    expect(past.filter((row) => row.state === 'active')).toEqual([]);
    // Only the texted one is left of what the top-up made, cancelled; the rest were removed.
    expect(past.filter((row) => (row.date as string) > '2027-05-24')).toMatchObject([
      { id: texted, state: 'cancelled' },
    ]);
  });

  it('lets the MCP server, with only its own fields, do all that its tools do', async () => {
    const api = dataApi();
    const clock = createFixedClock('2026-11-19T20:00:00.000Z');
    const timeZone = 'America/New_York';
    // A text has reached Susan about one Appointment, written as the scheduled run would.
    const commands = createCalendarCore({
      store: dataStore(api.client),
      clock,
      messenger: createMemoryMessenger(),
      textSender: createStandInSender(),
      timeZone,
    });
    const texted = await commands.addAppointment(linda, checkUp);
    await commands.changeSettings(linda, { susansNumber: '+15555550123' });
    clock.set(texted.reminders[0].dueAt);
    await commands.runDue();

    const agent = createCalendarCore({
      store: dataStore(limitedTo(api.client, MCP_SERVER_FIELDS)),
      clock,
      messenger: createMemoryMessenger(['person-linda', 'person-mark']),
      textSender: NO_TEXT_SENDER,
      timeZone,
    });
    const lindasAgent: Actor = { ...linda, viaAgent: true };
    // Reading: list_appointments, get_appointment, list_texts, list_series and get_series.
    expect(await agent.appointments()).toHaveLength(1);
    expect(await agent.appointment(texted.id)).toMatchObject({ id: texted.id });
    expect(await agent.textsAbout(texted.id)).toHaveLength(1);
    // Changing: each Appointment and Series tool, with the ID an add is given.
    const added = await agent.addAppointment(
      lindasAgent,
      { ...checkUp, date: '2026-11-25' },
      '0b9f6a52-8d1e-4b7a-9c3f-2e5d7a1c4b60',
    );
    await agent.changeAppointment(lindasAgent, added.id, { time: '15:30' });
    await agent.cancelAppointment(lindasAgent, added.id);
    await agent.deleteAppointment(lindasAgent, added.id);
    await agent.cancelAppointment(lindasAgent, texted.id);
    await expect(agent.deleteAppointment(lindasAgent, texted.id)).rejects.toThrow(/texted/);
    const { series, appointments } = await agent.addSeries(
      lindasAgent,
      {
        what: 'Dialysis',
        date: '2026-11-23',
        time: '09:00',
        repeat: { every: 'week', weekdays: [0] },
      },
      '7c1d2e3f-4a5b-4c6d-8e7f-901a2b3c4d5e',
    );
    expect(await agent.everySeries()).toHaveLength(1);
    expect(await agent.series(series.id)).toMatchObject({ id: series.id });
    await agent.changeAppointment(lindasAgent, appointments[1].id, { placeName: 'Unit B' });
    await agent.changeSeries(lindasAgent, appointments[2].id, { time: '10:00' });
    await agent.endSeries(lindasAgent, appointments[4].id);

    expect(api.activity()).toHaveLength(10);
    expect(api.texts()).toHaveLength(1);
  });

  it('hands back an Appointment the clocks moved on, and its held Reminder, as they were', async () => {
    const { store, core } = calendar();
    const { appointments } = await core.addSeries(linda, {
      what: 'Night check',
      date: '2027-03-07',
      time: '03:30',
      repeat: { every: 'week', weekdays: [6] },
      reminders: [{ shape: 'daysBefore', days: 0, time: '02:30' }],
    });
    const held = appointments.find(({ date }) => date === '2027-03-14')!;
    expect(held.reminders[0].needsReview).toBe(true);
    expect(await store.appointment(held.id)).toEqual(held);
    const { appointments: moved } = await core.addSeries(linda, {
      what: 'Night check',
      date: '2027-03-07',
      time: '02:30',
      repeat: { every: 'week', weekdays: [6] },
    });
    const shifted = moved.find(({ date }) => date === '2027-03-14')!;
    expect(shifted.series?.shiftedFrom).toBe('02:30');
    expect(await store.appointment(shifted.id)).toEqual(shifted);
  });

  it('reads an Appointment kept before Series existed as in none', async () => {
    const { api, store, core } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    delete api.appointments()[0].series;
    expect(await store.appointment(added.id)).toEqual(added);
  });

  it('reads an Appointment kept before a detail existed', async () => {
    const { api, store, core } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    const row = api.appointments()[0];
    delete row.withWhom;
    delete row.lastChanged;
    row.state = null;
    expect(await store.appointment(added.id)).toEqual(added as Appointment);
  });

  it('holds Reminders of every shape, flagged or not, and hands them back as they were', async () => {
    const { api, store, core } = calendar();
    const { id } = await core.addAppointment(linda, {
      ...checkUp,
      reminders: [
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'before', amount: 2, unit: 'hours' },
        { shape: 'at', date: '2026-11-19', time: '20:00' },
      ],
    });
    const moved = await core.changeAppointment(linda, id, { time: '15:30' });
    expect(moved.reminders.map((r) => r.needsReview)).toEqual([false, true, false]);
    // The data API gives every field of a Reminder, with null for those of the other shapes.
    const row = api.appointments()[0];
    row.reminders = (row.reminders as Record<string, unknown>[]).map((reminder) => ({
      amount: null,
      unit: null,
      days: null,
      date: null,
      time: null,
      ...reminder,
    }));
    expect(await store.appointment(id)).toEqual(moved);
  });

  it('reads an Appointment kept before Reminders existed as having none', async () => {
    const { api, store, core } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    delete api.appointments()[0].reminders;
    expect(await store.appointment(added.id)).toEqual({ ...added, reminders: [] });
  });

  it('reads a Reminder kept before ticket 11 as having no record of when it was set', async () => {
    const { api, store, core } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    delete (api.appointments()[0].reminders as Record<string, unknown>[])[0].setAt;
    const [reminder] = (await store.appointment(added.id))!.reminders;
    expect(reminder).toEqual({ ...added.reminders[0], setAt: null });
  });

  it('keeps the record of each text, claimed once: a second claim of it fails', async () => {
    const { api, store, core } = calendar();
    await core.changeSettings(linda, { susansNumber: '555 555 0123' });
    const text = await core.sendTestText(linda);
    expect(api.texts()).toMatchObject([{ id: text.id, status: 'sent' }]);
    expect(await store.claimText({ ...text, status: 'waiting' })).toBe(false);
    expect(await store.everyText()).toEqual([text]);
  });

  it('takes up a waiting text only while it is as it was read, through a conditional write', async () => {
    const { store, core } = calendar();
    await core.changeSettings(linda, { susansNumber: '555 555 0123' });
    const waiting = {
      id: 'test:2026-11-19T20:00:00.000Z',
      kind: 'test' as const,
      appointmentId: null,
      reminderId: null,
      words: "Susan's Calendar: This is a test text.",
      dueAt: '2026-11-19T20:00:00.000Z',
      status: 'waiting' as const,
      reason: null,
      attempts: 1,
      triedAt: '2026-11-19T20:00:00.000Z',
      sentAt: null,
      reference: null,
      replyId: null,
      creditLeft: null,
      alert: null,
      told: null,
    };
    await store.claimText(waiting);
    const again = { ...waiting, attempts: 2, triedAt: '2026-11-19T20:02:00.000Z' };
    expect(await store.retakeText(again, waiting)).toBe(true);
    // A second run read it before the first took it up: its retake is refused.
    expect(await store.retakeText({ ...again, triedAt: '2026-11-19T20:02:01.000Z' }, waiting)).toBe(
      false,
    );
    expect(await store.everyText()).toEqual([again]);
  });

  it('settles a text, or takes up its Alert, only while it is as it was read', async () => {
    const { api, store, core } = calendar();
    await core.changeSettings(linda, { susansNumber: '555 555 0123' });
    const sent = await core.sendTestText(linda);
    const failed = {
      ...sent,
      status: 'failed' as const,
      reason: 'unconfirmed' as const,
      alert: { state: 'due' as const, tries: 0, triedAt: null, sent: [], refused: [] },
    };
    expect(await store.changeText(failed, sent)).toBe(true);
    // A second run read it as sent too: it has been settled since, so its write is refused.
    expect(await store.changeText({ ...sent, status: 'delivered' }, sent)).toBe(false);
    const taken = {
      ...failed,
      alert: {
        state: 'sending' as const,
        tries: 1,
        triedAt: '2026-11-19T20:01:00.000Z',
        sent: [],
        refused: [],
      },
    };
    expect(await store.changeText(taken, failed)).toBe(true);
    // Taken up once: a second run that read it as due cannot take it up too.
    expect(await store.changeText(taken, failed)).toBe(false);
    // The run holding it records each delivery as it goes.
    const progress = {
      ...taken,
      alert: { ...taken.alert, sent: ['email:person-linda'], refused: ['email:person-mark'] },
    };
    expect(await store.changeText(progress, taken)).toBe(true);
    // A run that takes it over later, at another moment, leaves the first run's writes refused.
    const over = {
      ...progress,
      alert: { ...progress.alert, tries: 2, triedAt: '2026-11-19T20:04:00.000Z' },
    };
    expect(await store.changeText(over, progress)).toBe(true);
    expect(
      await store.changeText(
        { ...progress, alert: { ...progress.alert, state: 'raised' as const } },
        progress,
      ),
    ).toBe(false);
    expect(await store.everyText()).toEqual([over]);
    // Kept flat beside the rest, so that a write can be conditioned on it.
    expect(api.texts()[0]).toMatchObject({
      alert: 'sending',
      alertTries: 2,
      alertTriedAt: '2026-11-19T20:04:00.000Z',
      alertSent: ['email:person-linda'],
      alertRefused: ['email:person-mark'],
    });
  });

  it('keeps each Reply once, and answers or passes it on only while it is as it was read', async () => {
    const { api, store, core } = calendar();
    await core.changeSettings(linda, { susansNumber: '555 555 0123' });
    const reply = (await core.receiveReply({
      key: 'abc',
      words: 'On my way',
      from: '+15555550123',
    }))!;
    expect(
      await core.receiveReply({ key: 'abc', words: 'On my way', from: '+15555550123' }),
    ).toEqual(reply);
    expect(await store.everyReply()).toEqual([reply]);
    const answered = { ...reply, answer: 'sent' as const };
    expect(await store.changeReply(answered, reply)).toBe(true);
    // A second run read it as due too: it has been answered since, so its write is refused.
    expect(await store.changeReply({ ...reply, answer: 'recent' }, reply)).toBe(false);
    const taken = {
      ...answered,
      passOn: {
        ...answered.passOn,
        state: 'sending' as const,
        tries: 1,
        triedAt: '2026-11-19T20:01:00.000Z',
      },
    };
    expect(await store.changeReply(taken, answered)).toBe(true);
    expect(await store.changeReply(taken, answered)).toBe(false);
    expect(await store.everyReply()).toEqual([taken]);
    // Kept flat beside the rest, so that a write can be conditioned on it.
    expect(api.replies()[0]).toMatchObject({
      id: 'reply:abc',
      words: 'On my way',
      numberId: (await store.settings()).numberId,
      answer: 'sent',
      passOn: 'sending',
      passOnTries: 1,
      passOnTriedAt: '2026-11-19T20:01:00.000Z',
    });
  });

  it('keeps each calendar Alert once, and sends it only while it is as it was read', async () => {
    const { api, store, core } = calendar();
    const alert = (await core.recordOptOut({ key: 'report-1' }))!;
    expect(await core.recordOptOut({ key: 'report-1' })).toBeNull();
    expect(await store.everyCalendarAlert()).toEqual([alert]);
    const taken = {
      ...alert,
      progress: {
        ...alert.progress,
        state: 'sending' as const,
        tries: 1,
        triedAt: '2026-11-19T20:01:00.000Z',
      },
    };
    expect(await store.changeCalendarAlert(taken, alert)).toBe(true);
    expect(await store.changeCalendarAlert(taken, alert)).toBe(false);
    expect(api.calendarAlerts()[0]).toMatchObject({
      kind: 'textsBlocked',
      state: 'sending',
      tries: 1,
    });
  });

  it('keeps which Replies each person has seen', async () => {
    const { store, core } = calendar();
    expect(await store.repliesSeen('person-linda')).toBeNull();
    await core.seeReplies(linda, '2026-11-19T20:00:00.000Z');
    await core.seeReplies(linda, '2026-11-19T20:05:00.000Z');
    expect(await store.repliesSeen('person-linda')).toBe('2026-11-19T20:05:00.000Z');
    expect(await store.repliesSeen('person-mark')).toBeNull();
  });

  it("never takes a person's mark back, whichever of two devices writes first", async () => {
    const { store } = calendar();
    // Two devices make the person's first mark at once: the later one wins, in either order.
    await Promise.all([
      store.advanceRepliesSeen('person-linda', '2026-11-19T20:05:00.000Z'),
      store.advanceRepliesSeen('person-linda', '2026-11-19T20:01:00.000Z'),
    ]);
    expect(await store.repliesSeen('person-linda')).toBe('2026-11-19T20:05:00.000Z');
    // A device that read an older mark, and marks less than is kept now, changes nothing.
    await store.advanceRepliesSeen('person-linda', '2026-11-19T20:03:00.000Z');
    expect(await store.repliesSeen('person-linda')).toBe('2026-11-19T20:05:00.000Z');
    await store.advanceRepliesSeen('person-linda', '2026-11-19T20:09:00.000Z');
    expect(await store.repliesSeen('person-linda')).toBe('2026-11-19T20:09:00.000Z');
  });

  it('reads a text kept before Alerts as having none', async () => {
    const { api, store, core } = calendar();
    await core.changeSettings(linda, { susansNumber: '555 555 0123' });
    const text = await core.sendTestText(linda);
    delete api.texts()[0].alert;
    expect(await store.everyText()).toEqual([{ ...text, alert: null }]);
  });

  it('finds the texts about an Appointment, which decide whether it can be deleted', async () => {
    const { store, core } = calendar();
    const added = await core.addAppointment(linda, checkUp);
    const [reminder] = added.reminders;
    const text = {
      id: `reminder:${added.id}:${reminder.id}:${reminder.dueAt}`,
      kind: 'reminder' as const,
      appointmentId: added.id,
      reminderId: reminder.id,
      words: "Susan's Calendar: Cardiology check-up.",
      dueAt: reminder.dueAt,
      status: 'sent' as const,
      reason: null,
      attempts: 1,
      triedAt: reminder.dueAt,
      sentAt: reminder.dueAt,
      reference: null,
      replyId: null,
      creditLeft: 12,
      alert: null,
      // What it told her goes in and comes back as it was.
      told: { date: added.date, time: added.time, cancelled: false },
    };
    expect(await store.claimText(text)).toBe(true);
    expect(await store.textsAbout(added.id)).toEqual([text]);
    await expect(core.deleteAppointment(linda, added.id)).rejects.toThrow(/Cancel it instead/);
  });

  it('keeps the settings in one row, and reads none as none set', async () => {
    const { store, core } = calendar();
    expect(await store.settings()).toEqual({
      susansNumber: null,
      contactName: null,
      contactPhone: null,
      numberId: null,
      lastChanged: null,
    });
    await core.changeSettings(linda, { susansNumber: '555 555 0123' });
    const changed = await core.changeSettings(linda, { contactName: 'Linda' });
    expect(await store.settings()).toEqual(changed);
    expect(changed.numberId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("writes her number and its destination ID together, and a contact's save neither", async () => {
    const { api, core } = calendar();
    const models = api.client.models.CalendarSettings;
    const create = vi.spyOn(models, 'create');
    const update = vi.spyOn(models, 'update');
    await core.changeSettings(linda, { susansNumber: '555 555 0123', contactName: 'Linda' });
    // The first save makes the row, with the number and its ID in the one write.
    expect(create).toHaveBeenCalledTimes(1);
    const made = create.mock.calls[0][0] as Record<string, unknown>;
    expect(made).toMatchObject({
      id: 'settings',
      susansNumber: '+15555550123',
      contactName: 'Linda',
    });
    expect(made.numberId).toMatch(/^[0-9a-f-]{36}$/);
    // A save of the contact writes the contact alone.
    await core.changeSettings(linda, { contactName: 'Mark', contactPhone: '5555550187' });
    const contact = update.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(Object.keys(contact).sort()).toEqual(
      ['contactName', 'contactPhone', 'id', 'lastChanged'].sort(),
    );
    // A new number writes the number and a new ID together, and nothing else of Settings.
    await core.changeSettings(linda, { susansNumber: '5555550142' });
    const number = update.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(Object.keys(number).sort()).toEqual(
      ['id', 'lastChanged', 'numberId', 'susansNumber'].sort(),
    );
    expect(number.numberId).not.toBe(made.numberId);
    // Clearing it removes both.
    await core.changeSettings(linda, { susansNumber: null });
    expect(api.settingsRows()[0]).not.toHaveProperty('susansNumber');
    expect(api.settingsRows()[0]).not.toHaveProperty('numberId');
    expect(api.settingsRows()[0]).toMatchObject({ contactName: 'Mark' });
  });

  it("never puts back a replaced number by a contact's save begun before it was replaced", async () => {
    const { api, store, core } = calendar();
    await core.changeSettings(linda, { susansNumber: '555 555 0123', contactName: 'Linda' });
    // The contact's save read Settings before the number changed; its write lands after.
    const stale = await store.settings();
    await core.changeSettings(linda, { susansNumber: '5555550142' });
    const replaced = await store.settings();
    await store.keepSettings({ contactName: 'Ann', lastChanged: stale.lastChanged });
    expect(api.settingsRows()[0]).toMatchObject({
      susansNumber: '+15555550142',
      numberId: replaced.numberId,
      contactName: 'Ann',
    });
  });

  it('reads Settings kept before ticket 17 as unbound, and binds the same number on condition', async () => {
    const { api, store, core } = calendar();
    // As production holds them: her number, saved before Replies, with no destination ID.
    api.keepSettingsRow({ id: 'settings', susansNumber: '+15555550123', contactName: 'Linda' });
    expect(await store.settings()).toMatchObject({ susansNumber: '+15555550123', numberId: null });
    // A Reply is kept and passed on, but bound to nothing.
    const reply = (await core.receiveReply({ key: 'r1', words: 'Hi', from: '+15555550123' }))!;
    expect(reply).toMatchObject({ numberId: null, answer: 'unbound' });
    expect(api.replies()[0]).not.toHaveProperty('susansNumber');
    // Confirming another number binds nothing.
    await core.changeSettings(linda, { confirmSusansNumber: '5555550142' });
    expect(api.settingsRows()[0]).not.toHaveProperty('numberId');
    // Confirming the number as it is gives it an ID, by a write conditioned on it.
    const graphql = vi.spyOn(api.client, 'graphql');
    const bound = await core.changeSettings(linda, { confirmSusansNumber: '(555) 555-0123' });
    expect(bound.numberId).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.settingsRows()[0]).toMatchObject({
      susansNumber: '+15555550123',
      numberId: bound.numberId,
    });
    expect(graphql.mock.calls[0][0].variables).toMatchObject({
      input: { id: 'settings', numberId: bound.numberId },
      condition: {
        and: [{ susansNumber: { eq: '+15555550123' } }, { numberId: { attributeExists: false } }],
      },
    });
    // Once bound, confirming again changes nothing.
    await core.changeSettings(linda, { confirmSusansNumber: '5555550123' });
    expect(api.settingsRows()[0].numberId).toBe(bound.numberId);
    // A bind whose number was replaced meanwhile is refused as it is written.
    expect(await store.bindSusansNumber('+15555550199', 'another-id', bound.lastChanged!)).toBe(
      false,
    );
  });

  it('fails the command when the data API reports an error', async () => {
    const { api, core } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    api.failWith('Unauthorized');
    await expect(core.addAppointment(linda, checkUp)).rejects.toThrow('Unauthorized');
    await expect(core.changeAppointment(linda, id, { time: '15:30' })).rejects.toThrow(
      'Unauthorized',
    );
    await expect(core.deleteAppointment(linda, id)).rejects.toThrow('Unauthorized');
    api.failWith(null);
    expect(api.appointments()).toMatchObject([{ id, time: '14:00' }]);
  });
});

describe('agent keys kept in the data API', () => {
  const mark: Actor = { person: { id: 'person-mark', name: 'Mark' }, viaAgent: false };

  it('keep a hash of each, and remove one when it is revoked', async () => {
    const { api, core, store } = calendar();
    const laptop = await core.makeAgentKey(linda, 'Laptop');
    const phone = await core.makeAgentKey(linda, 'Phone');
    await core.makeAgentKey(mark, 'Mark');
    expect(JSON.stringify(api.agentKeys())).not.toContain(laptop.key);
    expect(await store.agentKeyByHash(phone.hash)).toEqual({
      hash: phone.hash,
      personId: 'person-linda',
      name: 'Phone',
      madeAt: phone.madeAt,
    });
    await core.revokeAgentKey(linda, laptop.hash);
    expect(await core.agentKeyOwner(laptop.key)).toBeNull();
    expect(await core.agentKeyOwner(phone.key)).toBe('person-linda');
    expect(api.agentKeys()).toHaveLength(2);
  });

  it('are revoked at once, even while reads have not caught up with the key being made', async () => {
    const { api, core } = calendar();
    api.freezeKeyReads();
    const { hash } = await core.makeAgentKey(linda, 'Laptop');
    await core.revokeAgentKey(linda, hash);
    expect(api.agentKeys()).toEqual([]);
  });

  it('are never revoked by anyone else, even while reads lag, and say nothing of whose', async () => {
    const { api, core } = calendar();
    api.freezeKeyReads();
    const { hash } = await core.makeAgentKey(linda, 'Laptop');
    await core.revokeAgentKey(mark, hash);
    await core.revokeAgentKey(mark, 'f'.repeat(64));
    expect(api.agentKeys()).toMatchObject([{ hash, personId: 'person-linda' }]);
  });

  it('fail the revocation when the data API reports an error', async () => {
    const { api, core } = calendar();
    const { hash } = await core.makeAgentKey(linda, 'Laptop');
    api.failWith('The data API is not answering');
    await expect(core.revokeAgentKey(linda, hash)).rejects.toThrow();
    api.failWith(null);
    expect(api.agentKeys()).toHaveLength(1);
  });
});

describe('subscription links kept in the data API', () => {
  it('keep a hash for each person, and replace it when they make another', async () => {
    const { api, core } = calendar();
    const first = await core.makeSubscriptionLink(linda);
    const second = await core.makeSubscriptionLink(linda);
    expect(api.links()).toMatchObject([{ personId: 'person-linda', madeAt: second.madeAt }]);
    expect(JSON.stringify(api.links())).not.toContain(second.secret);
    expect(await core.subscriptionFeed(first.secret)).toBeNull();
    expect(await core.subscriptionFeed(second.secret)).toContain('BEGIN:VCALENDAR');
    await core.switchOffSubscriptionLink(linda);
    expect(api.links()).toEqual([]);
  });

  it('stop working at once when switched off, even before the index has caught up', async () => {
    const { api, core } = calendar();
    const old = await core.makeSubscriptionLink(linda);
    api.freezeIndex();
    await core.switchOffSubscriptionLink(linda);
    expect(await core.subscriptionFeed(old.secret)).toBeNull();
    await core.makeSubscriptionLink(linda);
    expect(await core.subscriptionFeed(old.secret)).toBeNull();
  });

  it('give a feed of every Appointment, however many pages they take to read', async () => {
    const { core } = calendar();
    for (const day of ['20', '21', '22', '23', '24'])
      await core.addAppointment(linda, { ...checkUp, date: `2026-11-${day}` });
    const feed = await core.subscriptionFeed((await core.makeSubscriptionLink(linda)).secret);
    expect(feed?.match(/BEGIN:VEVENT/g)).toHaveLength(5);
  });
});
