import { describe, expect, it } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  createMemoryMessenger,
  type Actor,
  type Appointment,
  createStandInSender,
} from '../../src/lib/calendar';
import { dataStore, type DataClient } from './data-store';

type Row = Record<string, unknown> & { id: string };

/**
 * Stands in for the data API: keeps rows the way it does, adding its own fields beside them, and
 * answers every call with `{ data, errors }`.
 */
function dataApi() {
  const tables = {
    Appointment: new Map<string, Row>(),
    ActivityRecord: new Map<string, Row>(),
    Text: new Map<string, Row>(),
    CalendarSettings: new Map<string, Row>(),
  };
  let failure: string | null = null;
  const answer = <T>(data: T) =>
    failure ? { data: null, errors: [{ message: failure }] } : { data };
  const model = (rows: Map<string, Row>) => ({
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
    async update(input: Row) {
      if (failure) return answer(null);
      const row = { ...rows.get(input.id), ...input, updatedAt: '2026-11-19T21:00:01.000Z' };
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
  const client = {
    models: {
      Appointment: model(tables.Appointment),
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
      CalendarSettings: model(tables.CalendarSettings),
    },
    // Only the conditional update of a text, as DynamoDB checks it: every `eq` in the condition
    // must hold of the row as it is when written. The client throws an answer that has errors.
    async graphql({ query, variables }: { query: string; variables: Record<string, unknown> }) {
      if (!query.includes('updateText(input: $input, condition: $condition)'))
        throw new Error('This stand-in only answers a conditional updateText.');
      const input = variables.input as Row;
      const { and } = variables.condition as { and: Record<string, { eq: unknown }>[] };
      const row = tables.Text.get(input.id);
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
      tables.Text.set(input.id, { ...row, ...input });
      return { data: { updateText: { id: input.id } } };
    },
  } as unknown as DataClient;
  return {
    client,
    appointments: () => [...tables.Appointment.values()],
    activity: () => [...tables.ActivityRecord.values()],
    links: () => [...links.values()],
    texts: () => [...tables.Text.values()],
    /** The index stops hearing of changes until it is told to catch up. */
    freezeIndex() {
      index = structuredClone([...links.values()]);
    },
    failWith(message: string | null) {
      failure = message;
    },
  };
}

const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };
const checkUp = { what: 'Cardiology check-up', date: '2026-11-20', time: '14:00' };

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
      creditLeft: null,
      alert: null,
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
      creditLeft: 12,
      alert: null,
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
      lastChanged: null,
    });
    await core.changeSettings(linda, { susansNumber: '555 555 0123' });
    const changed = await core.changeSettings(linda, { contactName: 'Linda' });
    expect(await store.settings()).toEqual(changed);
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
