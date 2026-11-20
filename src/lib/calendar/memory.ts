// In-memory stand-ins for the calendar core's ports. Tests drive the core against them, and the app
// runs on them when it has no backend (src/data/sampleCalendar.ts).

import { inDateOrder, type ActivityRecord, type Appointment } from './appointment';
import type {
  AdminEmail,
  AdminMessenger,
  AppNotification,
  Clock,
  Deliveries,
  SendResult,
  Store,
  TextSender,
} from './ports';
import type { SubscriptionLink } from './subscription';
import { NO_SETTINGS, type CalendarSettings, type Text } from './texts';

export interface MemoryStore extends Store {
  /** Every Appointment in the calendar, in date order. */
  appointments(): Appointment[];
  /** Every activity record, oldest first. */
  activity(): ActivityRecord[];
  /** Every subscription link kept, as it is kept. */
  subscriptionLinks(): SubscriptionLink[];
  /** The record of every text, oldest due first. */
  texts(): Text[];
  /** Calls `listener` after every change. Returns how to stop. */
  subscribe(listener: () => void): () => void;
}

export function createMemoryStore(): MemoryStore {
  const appointments = new Map<string, Appointment>();
  const activity: ActivityRecord[] = [];
  const texts = new Map<string, Text>();
  let settings: CalendarSettings = NO_SETTINGS;
  const links = new Map<string, SubscriptionLink>();
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };

  // Everything is copied on the way in and out, as a real store would: nothing a caller holds can
  // change what is kept.
  return {
    async appointment(id) {
      const found = appointments.get(id);
      return found ? structuredClone(found) : null;
    },
    async addAppointment(appointment) {
      appointments.set(appointment.id, structuredClone(appointment));
      changed();
    },
    async replaceAppointment(appointment) {
      appointments.set(appointment.id, structuredClone(appointment));
      changed();
    },
    async removeAppointment(id) {
      appointments.delete(id);
      changed();
    },
    async textsAbout(appointmentId) {
      return structuredClone([...texts.values()].filter((t) => t.appointmentId === appointmentId));
    },
    async everyText() {
      return structuredClone([...texts.values()]);
    },
    async claimText(text) {
      if (texts.has(text.id)) return false;
      texts.set(text.id, structuredClone(text));
      changed();
      return true;
    },
    async retakeText(next, current) {
      const kept = texts.get(next.id);
      const still =
        kept?.status === 'waiting' &&
        kept.attempts === current.attempts &&
        kept.triedAt === current.triedAt;
      if (!still) return false;
      texts.set(next.id, structuredClone(next));
      changed();
      return true;
    },
    async changeText(next, current) {
      const kept = texts.get(next.id);
      const still =
        kept !== undefined &&
        kept.status === current.status &&
        kept.attempts === current.attempts &&
        kept.triedAt === current.triedAt &&
        (current.alert === null ||
          (kept.alert?.state === current.alert.state &&
            kept.alert.triedAt === current.alert.triedAt));
      if (!still) return false;
      texts.set(next.id, structuredClone(next));
      changed();
      return true;
    },
    async replaceText(text) {
      texts.set(text.id, structuredClone(text));
      changed();
    },
    async settings() {
      return structuredClone(settings);
    },
    async keepSettings(next) {
      settings = structuredClone(next);
      changed();
    },
    async recordActivity(record) {
      activity.push(structuredClone(record));
    },
    async everyAppointment() {
      return structuredClone([...appointments.values()]);
    },
    async subscriptionLinkOf(personId) {
      const found = links.get(personId);
      return found ? structuredClone(found) : null;
    },
    async subscriptionLinkByHash(hash) {
      const found = [...links.values()].find((link) => link.hash === hash);
      return found ? structuredClone(found) : null;
    },
    async keepSubscriptionLink(link) {
      links.set(link.personId, structuredClone(link));
    },
    async removeSubscriptionLink(personId) {
      links.delete(personId);
    },

    appointments: () => inDateOrder(structuredClone([...appointments.values()])),
    activity: () => structuredClone(activity),
    subscriptionLinks: () => structuredClone([...links.values()]),
    texts: () =>
      structuredClone(
        [...texts.values()].sort(
          (a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id),
        ),
      ),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** A clock that says what it is told to. */
export interface FixedClock extends Clock {
  /** Moves the clock to a moment, given as an ISO timestamp. */
  set(at: string): void;
}

export function createFixedClock(at: string): FixedClock {
  let now = new Date(at);
  return {
    now: () => new Date(now),
    set(next) {
      now = new Date(next);
    },
  };
}

/** A text the stand-in sender took: where it would have gone, and its words. */
export interface StandInText {
  to: string;
  words: string;
}

/**
 * The text sender used wherever Textbelt's key is absent, sample data included: it records each
 * text instead of sending it, and logs nothing. A test can make the next sends fail, either for
 * certain (`refuseNext`) or so that nobody can tell whether they went (`breakNext`).
 */
export interface StandInSender extends TextSender {
  /** Every text it took, oldest first. */
  taken(): StandInText[];
  /** The next `times` sends throw, as when the connection drops mid-send. */
  breakNext(times?: number): void;
  /** The next `times` sends are refused. */
  refuseNext(times?: number): void;
}

export function createStandInSender(): StandInSender {
  const taken: StandInText[] = [];
  let broken = 0;
  let refused = 0;
  return {
    async send({ to, words }): Promise<SendResult> {
      if (broken > 0) {
        broken -= 1;
        throw new Error('The stand-in sender was told to fail.');
      }
      if (refused > 0) {
        refused -= 1;
        return { sent: false };
      }
      taken.push({ to, words });
      return { sent: true, reference: `stand-in-${taken.length}` };
    },
    taken: () => structuredClone(taken),
    breakNext(times = 1) {
      broken += times;
    },
    refuseNext(times = 1) {
      refused += times;
    },
  };
}

/** A channel the messenger reaches Admins by. */
export type MemoryChannel = 'email' | 'app';

/** A messenger that keeps what it is asked to send. */
export interface MemoryMessenger extends AdminMessenger {
  /** Every app notification sent, oldest first, with the person IDs it reached. */
  appNotifications(): { to: string[]; notification: AppNotification }[];
  /** Every email sent, oldest first, with the person IDs it reached. */
  emails(): { to: string[]; email: AdminEmail }[];
  /** Makes the messenger fail, as when the push service or the user pool is not answering. */
  fail(failing: boolean): void;
  /** Makes sending email throw, as when nobody can tell what was sent. */
  failEmail(failing: boolean): void;
  /** The next `times` deliveries to this person by this channel fail, and may go if tried again. */
  failFor(channel: MemoryChannel, personId: string, times?: number): void;
  /** Deliveries to this person by this channel are refused for good. */
  refuseFor(channel: MemoryChannel, personId: string): void;
  /** This person has nothing to be reached by on this channel: no address, or no device. */
  unreachable(channel: MemoryChannel, personId: string): void;
}

/**
 * `admins` is the person ID of every Admin. Each delivery is named by its channel and person, as
 * 'email:<person ID>' or 'app:<person ID>': here, each person has one device.
 */
export function createMemoryMessenger(admins: readonly string[] = []): MemoryMessenger {
  const sent: { to: string[]; notification: AppNotification }[] = [];
  const emailed: { to: string[]; email: AdminEmail }[] = [];
  let failing = false;
  let failingEmail = false;
  const failures = new Map<string, number>();
  const refused = new Set<string>();
  const unreachable = new Set<string>();
  const check = () => {
    if (failing) throw new Error('The messenger is not answering');
  };
  /** Makes each delivery to these people by this channel, and answers what became of each. */
  function deliver(channel: MemoryChannel, to: readonly string[], skip: readonly string[]) {
    const result: Deliveries = { sent: [], failed: [], refused: [] };
    const reached: string[] = [];
    for (const id of to) {
      const key = `${channel}:${id}`;
      // As the backend's does, email goes only to Admins.
      if (skip.includes(key) || unreachable.has(key)) continue;
      if (channel === 'email' && !admins.includes(id)) continue;
      if (refused.has(key)) {
        result.refused.push(key);
        continue;
      }
      const left = failures.get(key) ?? 0;
      if (left > 0) {
        failures.set(key, left - 1);
        result.failed.push(key);
        continue;
      }
      result.sent.push(key);
      reached.push(id);
    }
    return { result, reached };
  }
  return {
    async admins() {
      check();
      return [...admins];
    },
    async sendAppNotification(to, notification, skip = []) {
      check();
      const { result, reached } = deliver('app', to, skip);
      if (reached.length) sent.push(structuredClone({ to: reached, notification }));
      return result;
    },
    async sendEmail(to, email, skip = []) {
      check();
      if (failingEmail) throw new Error('The email service is not answering');
      const { result, reached } = deliver('email', to, skip);
      if (reached.length) emailed.push(structuredClone({ to: reached, email }));
      return result;
    },
    appNotifications: () => structuredClone(sent),
    emails: () => structuredClone(emailed),
    fail(next) {
      failing = next;
    },
    failEmail(next) {
      failingEmail = next;
    },
    failFor(channel, personId, times = 1) {
      failures.set(`${channel}:${personId}`, times);
    },
    refuseFor(channel, personId) {
      refused.add(`${channel}:${personId}`);
    },
    unreachable(channel, personId) {
      unreachable.add(`${channel}:${personId}`);
    },
  };
}
