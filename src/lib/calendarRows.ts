// Calendar data as the data API hands it over, turned into what the calendar core calls it. Shared
// by the app, which reads the data API directly, and the backend's store.

import type { Schema } from '../../amplify/data/resource';
import type { Appointment, Stamp } from './calendar';

export type AppointmentRow = Schema['Appointment']['type'];

/** A row's fields that the calendar core also names; the data API adds its own beside them. */
type Kept<Row, Value> = Pick<Row, Extract<keyof Row, keyof Value>>;

const toStamp = ({ personId, personName, viaAgent, at }: Stamp): Stamp => ({
  personId,
  personName,
  viaAgent,
  at,
});

export function toAppointment(row: Kept<AppointmentRow, Appointment>): Appointment {
  return {
    id: row.id,
    what: row.what,
    date: row.date,
    time: row.time,
    startsAt: row.startsAt,
    withWhom: row.withWhom ?? null,
    placeName: row.placeName ?? null,
    placeAddress: row.placeAddress ?? null,
    driverName: row.driverName ?? null,
    pickupTime: row.pickupTime ?? null,
    noteForSusan: row.noteForSusan ?? null,
    privateNotes: row.privateNotes ?? null,
    state: row.state ?? 'active',
    added: toStamp(row.added),
    lastChanged: row.lastChanged ? toStamp(row.lastChanged) : null,
  };
}
