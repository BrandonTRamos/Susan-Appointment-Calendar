// The calendar as the data API carries it (amplify/data/resource.ts): what it hands over when read,
// and what a command answers with. Shared by the app, which reads the data API directly, and the
// backend.

import type { Schema } from '../../amplify/data/resource';
import type {
  Appointment,
  MadeSubscriptionLink,
  RefusalField,
  RefusalReason,
  Reminder,
  ReminderTiming,
  Repeat,
  Series,
  SeriesPlace,
  SeriesReminder,
  Stamp,
} from './calendar';

/**
 * What a command answers with: the Appointment as it now is (null once deleted), the subscription
 * link just made (null once switched off), or the core's refusal. A refusal is an answer, not an error, so that it reaches the person in the core's own
 * words; an error means the command may not have been carried out at all.
 */
export type CommandAnswer =
  | { appointment: Appointment | null }
  | { subscriptionLink: MadeSubscriptionLink | null }
  | { refusal: { reason: RefusalReason; message: string; detail?: RefusalField } };

/** Said when a command failed for a reason that is nobody's mistake. */
export const COMMAND_FAILED = 'Could not save the change. Check your connection and try again.';

export type AppointmentRow = Schema['Appointment']['type'];
export type SeriesRow = Schema['Series']['type'];

/** A row's fields that the calendar core also names; the data API adds its own beside them. */
type Kept<Row, Value> = Pick<Row, Extract<keyof Row, keyof Value>>;

const toStamp = ({ personId, personName, viaAgent, at }: Stamp): Stamp => ({
  personId,
  personName,
  viaAgent,
  at,
});

type ReminderRow = NonNullable<NonNullable<AppointmentRow['reminders']>[number]>;

/** A Reminder as the data API carries it, or null when it is not one the calendar could have kept. */
function toReminder(row: ReminderRow | null | undefined): Reminder | null {
  if (!row?.shape) return null;
  const { id, dueAt, needsReview } = row;
  let timing: ReminderTiming;
  if (row.shape === 'before' && row.amount != null && row.unit)
    timing = { shape: 'before', amount: row.amount, unit: row.unit };
  else if (row.shape === 'daysBefore' && row.days != null && row.time)
    timing = { shape: 'daysBefore', days: row.days, time: row.time };
  else if (row.shape === 'at' && row.date && row.time)
    timing = { shape: 'at', date: row.date, time: row.time };
  else return null;
  return { id, ...timing, dueAt, needsReview };
}

type RepeatRow = NonNullable<AppointmentRow['series']>['repeat'];

/** A pattern as the data API carries it, or null when it is not one the calendar could have kept. */
function toRepeat(row: RepeatRow | null | undefined): Repeat | null {
  if (row?.every === 'week')
    return {
      every: 'week',
      interval: row.interval,
      weekdays: (row.weekdays ?? []).flatMap((weekday) => (weekday == null ? [] : [weekday])),
    };
  if (row?.every === 'month' && row.day != null)
    return { every: 'month', interval: row.interval, day: row.day };
  return null;
}

function toPlace(row: AppointmentRow['series'] | undefined): SeriesPlace | null {
  const repeat = toRepeat(row?.repeat);
  if (!row || !repeat) return null;
  const { id, date, individuallyChanged } = row;
  return { id, date, repeat, individuallyChanged };
}

type SeriesReminderRow = NonNullable<NonNullable<SeriesRow['reminders']>[number]>;

function toSeriesReminder(row: SeriesReminderRow | null | undefined): SeriesReminder | null {
  if (row?.shape === 'before' && row.amount != null && row.unit)
    return { shape: 'before', amount: row.amount, unit: row.unit };
  if (row?.shape === 'daysBefore' && row.days != null && row.time)
    return { shape: 'daysBefore', days: row.days, time: row.time };
  return null;
}

/** A Series as the data API carries it. */
export function toSeries(row: Kept<SeriesRow, Series>): Series {
  return {
    id: row.id,
    what: row.what,
    time: row.time,
    withWhom: row.withWhom ?? null,
    placeName: row.placeName ?? null,
    placeAddress: row.placeAddress ?? null,
    driverName: row.driverName ?? null,
    pickupTime: row.pickupTime ?? null,
    noteForSusan: row.noteForSusan ?? null,
    privateNotes: row.privateNotes ?? null,
    // Every Series is kept with a pattern; one read without is taken to repeat weekly on no day.
    repeat: toRepeat(row.repeat) ?? { every: 'week', interval: 1, weekdays: [] },
    starts: row.starts,
    ends: row.ends ?? null,
    reminders: (row.reminders ?? []).flatMap((each) => toSeriesReminder(each) ?? []),
    madeThrough: row.madeThrough,
    added: toStamp(row.added),
    lastChanged: row.lastChanged ? toStamp(row.lastChanged) : null,
  };
}

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
    // An Appointment kept before Reminders existed has none.
    reminders: (row.reminders ?? []).flatMap((each) => toReminder(each) ?? []),
    // An Appointment kept before Series existed, or entered on its own, is in none.
    series: toPlace(row.series),
    added: toStamp(row.added),
    lastChanged: row.lastChanged ? toStamp(row.lastChanged) : null,
  };
}
