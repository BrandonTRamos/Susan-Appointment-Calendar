// Change notices: what Susan was last told of each Appointment, and whether and when a Change notice
// is due. Pure, so that the scheduled run and the Appointment detail decide the same way.

import { addDays, localDateTime, momentOrSkipped } from '../localTime';
import type { Appointment } from './appointment';
import { isOvernight } from './reminders';
import { mayHaveReachedSusan, type Text, type Told } from './texts';

/**
 * How long an Appointment must go without another edit before a Change notice about it is due, so
 * that one is not sent in the middle of someone's corrections.
 */
export const SETTLING_PERIOD = 5 * 60_000;

/** When a Change notice that comes up overnight goes out instead, in Susan's time zone. */
export const MORNING = '07:00';

/** What a text about the Appointment tells her of it as it now is. */
export const toldOf = (appointment: Pick<Appointment, 'date' | 'time' | 'state'>): Told => ({
  date: appointment.date,
  time: appointment.time,
  cancelled: appointment.state === 'cancelled',
});

/**
 * Whether the Appointment now differs from what she was told: cancelled when she was not told so,
 * or at another date or time. Once she has been told it is cancelled, it cannot change again.
 */
export function differsFrom(
  told: Told,
  appointment: Pick<Appointment, 'date' | 'time' | 'state'>,
): boolean {
  if (appointment.state === 'cancelled') return !told.cancelled;
  return told.cancelled || told.date !== appointment.date || told.time !== appointment.time;
}

/** The moment the Appointment was told to start, in Susan's time zone. */
const startOfTold = ({ date, time }: Told, timeZone: string) =>
  momentOrSkipped(date, time, timeZone).getTime();

/**
 * The moment past which a Change notice is too late to help: the later of the time she was told
 * before (`was`) and the time it tells her (`told`), which for a cancellation is the same one.
 */
export function changeNoticeCutoff(was: Told | null, told: Told, timeZone: string): string {
  const starts = [startOfTold(told, timeZone)];
  if (was) starts.push(startOfTold(was, timeZone));
  return new Date(Math.max(...starts)).toISOString();
}

/** When a text could have reached her: when the sender took it, or else when it was last tried. */
const reachedAt = (text: Text) => text.sentAt ?? text.triedAt;

const later = (a: Text, b: Text) =>
  reachedAt(a).localeCompare(reachedAt(b)) ||
  a.dueAt.localeCompare(b.dueAt) ||
  a.id.localeCompare(b.id);

/**
 * What Susan was last told of an Appointment: what the most recent text about it that may have
 * reached her told her (mayHaveReachedSusan in texts.ts). Null when no such text has gone out, so a
 * change to it is no news to her. A text recorded before the calendar kept what each one told her
 * is passed over. Given `before`, a text about it, only the texts that went before that one count.
 */
export function lastTold(
  appointmentId: string,
  texts: readonly Text[],
  before?: Text,
): Told | null {
  let latest: Text | null = null;
  for (const text of texts) {
    if (text.appointmentId !== appointmentId || !text.told || !mayHaveReachedSusan(text)) continue;
    if (before && (text.id === before.id || later(text, before) > 0)) continue;
    if (!latest || later(text, latest) > 0) latest = text;
  }
  return latest?.told ?? null;
}

/** The ID of the Change notice about an Appointment that is due at a moment. */
export const changeNoticeTextId = (appointment: Pick<Appointment, 'id'>, dueAt: string) =>
  `changeNotice:${appointment.id}:${dueAt}`;

/** A Change notice that the calendar owes Susan. */
export interface ChangeNotice {
  id: string;
  /** When it is due, as an ISO timestamp. */
  dueAt: string;
  /** What she was last told. */
  was: Told;
  /** What it tells her: the new date and time, or that the time she knew is cancelled. */
  told: Told;
  /** Whether it was put off until 7:00 am because it came up overnight. */
  heldOvernight: boolean;
  /** The later of the old and new times (for a cancellation, the old): past it, it is too late. */
  cutoff: string;
  /**
   * later: it is not yet due. send: it is due. tooLate: its old and new times have both passed, so
   * it is recorded as not sent.
   */
  plan: 'later' | 'send' | 'tooLate';
}

/**
 * The Change notice owed for an Appointment as things stand at `now`, or null when none is: when no
 * text about it has gone out, or it is as she was last told, or it was changed only once its old
 * and new times had both passed. `texts` are the texts recorded; whether this notice is among them
 * is for the caller to see, by its ID.
 *
 * It falls due a settling period after the Appointment's last edit, so a run of edits makes one
 * notice, about the net change. One that would fall due between 9:00 pm and 7:00 am, in Susan's
 * time zone, waits until 7:00 am, unless the old or the new time is still to come before then.
 */
export function changeNoticeOwed(
  appointment: Appointment,
  texts: readonly Text[],
  now: Date,
  timeZone: string,
): ChangeNotice | null {
  const was = lastTold(appointment.id, texts);
  if (!was || !differsFrom(was, appointment)) return null;
  const cancelled = appointment.state === 'cancelled';
  // A cancellation tells her that the time she knew is off.
  const told: Told = cancelled ? { ...was, cancelled: true } : toldOf(appointment);
  const starts = [startOfTold(was, timeZone), startOfTold(told, timeZone)];
  const cutoff = Math.max(...starts);
  const editedAt = Date.parse((appointment.lastChanged ?? appointment.added).at);
  // Changed once it was all over: there is nothing for her to act on.
  if (editedAt >= cutoff) return null;
  const settled = new Date(editedAt + SETTLING_PERIOD);
  let due = settled;
  if (isOvernight(settled, timeZone)) {
    const { date, time } = localDateTime(settled, timeZone);
    const morning = momentOrSkipped(time >= MORNING ? addDays(date, 1) : date, MORNING, timeZone);
    const soon = starts.some((start) => start > editedAt && start < morning.getTime());
    if (!soon) due = morning;
  }
  const dueAt = due.toISOString();
  return {
    id: changeNoticeTextId(appointment, dueAt),
    dueAt,
    was,
    told,
    heldOvernight: due !== settled,
    cutoff: new Date(cutoff).toISOString(),
    plan: now < due ? 'later' : now.getTime() >= cutoff ? 'tooLate' : 'send',
  };
}
