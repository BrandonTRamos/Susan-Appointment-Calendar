// The calendar as an agent is shown it: every date and time in Susan's local time, and every person
// by name alone, never by their account. Nothing here is about settings, keys, subscription links
// or accounts, and no text's record says where it went.

import {
  describeRepeat,
  type Appointment,
  type Reminder,
  type ReminderTiming,
  type Series,
  type Stamp,
  type Text,
} from '../../../src/lib/calendar';
import { formatDate, localDateTime } from '../../../src/lib/localTime';
import { KIND_NAMES, textStatus } from '../../../src/lib/textStatus';

/** A moment in Susan's local time: '2026-11-19 18:00'. */
export function localMoment(moment: string, timeZone: string): string {
  const { date, time } = localDateTime(new Date(moment), timeZone);
  return `${date} ${time}`;
}

/** Who did something, by name, whether through their agent, and when. */
const stamp = ({ personName, viaAgent, at }: Stamp, timeZone: string) => ({
  by: personName,
  viaAgent,
  at: localMoment(at, timeZone),
});

/** Only the fields of a Reminder's shape, as a person sets them. */
function timing(reminder: ReminderTiming) {
  switch (reminder.shape) {
    case 'before':
      return { shape: reminder.shape, amount: reminder.amount, unit: reminder.unit };
    case 'daysBefore':
      return { shape: reminder.shape, days: reminder.days, time: reminder.time };
    case 'at':
      return { shape: reminder.shape, date: reminder.date, time: reminder.time };
  }
}

const reminder = (each: Reminder, timeZone: string) => ({
  id: each.id,
  ...timing(each),
  goesOutAt: localMoment(each.dueAt, timeZone),
  needsReview: each.needsReview,
});

export function presentAppointment(appointment: Appointment, timeZone: string) {
  const place = appointment.series;
  return {
    id: appointment.id,
    what: appointment.what,
    date: appointment.date,
    day: formatDate(appointment.date),
    time: appointment.time,
    withWhom: appointment.withWhom,
    placeName: appointment.placeName,
    placeAddress: appointment.placeAddress,
    driverName: appointment.driverName,
    pickupTime: appointment.pickupTime,
    noteForSusan: appointment.noteForSusan,
    privateNotes: appointment.privateNotes,
    state: appointment.state,
    reminders: appointment.reminders.map((each) => reminder(each, timeZone)),
    series: place && {
      id: place.id,
      repeats: describeRepeat(place.repeat),
      individuallyChanged: place.individuallyChanged,
      // The Series' time, when the clocks going forward skipped it that night and moved it on.
      shiftedFrom: place.shiftedFrom,
    },
    added: stamp(appointment.added, timeZone),
    lastChanged: appointment.lastChanged && stamp(appointment.lastChanged, timeZone),
  };
}

export function presentSeries(series: Series, timeZone: string) {
  return {
    id: series.id,
    what: series.what,
    time: series.time,
    withWhom: series.withWhom,
    placeName: series.placeName,
    placeAddress: series.placeAddress,
    driverName: series.driverName,
    pickupTime: series.pickupTime,
    noteForSusan: series.noteForSusan,
    privateNotes: series.privateNotes,
    repeats: describeRepeat(series.repeat),
    repeat: series.repeat,
    starts: series.starts,
    ends: series.ends,
    reminders: series.reminders.map(timing),
    added: stamp(series.added, timeZone),
    lastChanged: series.lastChanged && stamp(series.lastChanged, timeZone),
  };
}

/** What became of a text, in the words the app shows. */
export function presentText(text: Text, timeZone: string) {
  const status = textStatus(text, timeZone);
  return {
    kind: KIND_NAMES[text.kind],
    reminderId: text.reminderId,
    due: localMoment(text.dueAt, timeZone),
    status: status.label,
    detail: status.detail,
    sentAt: text.sentAt && localMoment(text.sentAt, timeZone),
    words: text.words,
  };
}
