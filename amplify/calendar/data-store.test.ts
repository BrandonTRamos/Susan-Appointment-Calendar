import { describe, expect, it } from 'vitest';
import {
  createCalendarCore,
  createFixedClock,
  type Actor,
  type Appointment,
} from '../../src/lib/calendar';
import { dataStore, type DataClient } from './data-store';

type Row = Record<string, unknown> & { id: string };

/**
 * Stands in for the data API: keeps rows the way it does, adding its own fields beside them, and
 * answers every call with `{ data, errors }`.
 */
function dataApi() {
  const tables = { Appointment: new Map<string, Row>(), ActivityRecord: new Map<string, Row>() };
  let failure: string | null = null;
  const answer = <T>(data: T) =>
    failure ? { data: null, errors: [{ message: failure }] } : { data };
  const model = (rows: Map<string, Row>) => ({
    async get({ id }: { id: string }) {
      return answer(rows.get(id) ?? null);
    },
    async create(input: Row) {
      if (failure) return answer(null);
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
  const client = {
    models: {
      Appointment: model(tables.Appointment),
      ActivityRecord: model(tables.ActivityRecord),
    },
  } as unknown as DataClient;
  return {
    client,
    appointments: () => [...tables.Appointment.values()],
    activity: () => [...tables.ActivityRecord.values()],
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

  it('says no text has gone to Susan: nothing sends texts yet', async () => {
    const { store, core } = calendar();
    const { id } = await core.addAppointment(linda, checkUp);
    expect(await store.textSentAbout(id)).toBe(false);
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
