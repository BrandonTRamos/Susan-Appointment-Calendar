// In-memory stand-ins for the calendar core's ports. Tests drive the core against them, and the app
// runs on them when it has no backend (src/data/sampleCalendar.ts).

import { inDateOrder, type ActivityRecord, type Appointment } from './appointment';
import type { AdminMessenger, AppNotification, Clock, Store } from './ports';
import type { Series } from './series';
import type { SubscriptionLink } from './subscription';

export interface MemoryStore extends Store {
  /** Every Appointment in the calendar, in date order. */
  appointments(): Appointment[];
  /** Every activity record, oldest first. */
  activity(): ActivityRecord[];
  /** Every Series, in the order they were added. */
  everySeriesKept(): Series[];
  /** Every subscription link kept, as it is kept. */
  subscriptionLinks(): SubscriptionLink[];
  /**
   * Stands in for a text about the Appointment having gone to Susan. Nothing sends texts yet; the
   * rules that depend on one having gone are proven with this.
   */
  noteTextSentAbout(appointmentId: string): void;
  /** Calls `listener` after every change. Returns how to stop. */
  subscribe(listener: () => void): () => void;
}

export function createMemoryStore(): MemoryStore {
  const appointments = new Map<string, Appointment>();
  const activity: ActivityRecord[] = [];
  const texted = new Set<string>();
  const series = new Map<string, Series>();
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
    async textSentAbout(appointmentId) {
      return texted.has(appointmentId);
    },
    async recordActivity(record) {
      activity.push(structuredClone(record));
    },
    async everyAppointment() {
      return structuredClone([...appointments.values()]);
    },
    async series(id) {
      const found = series.get(id);
      return found ? structuredClone(found) : null;
    },
    async addSeries(added) {
      series.set(added.id, structuredClone(added));
    },
    async replaceSeries(replaced) {
      series.set(replaced.id, structuredClone(replaced));
    },
    async everySeries() {
      return structuredClone([...series.values()]);
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
    everySeriesKept: () => structuredClone([...series.values()]),
    subscriptionLinks: () => structuredClone([...links.values()]),
    noteTextSentAbout(appointmentId) {
      texted.add(appointmentId);
    },
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

/** A messenger that keeps what it is asked to send. */
export interface MemoryMessenger extends AdminMessenger {
  /** Every app notification sent, oldest first, with the person IDs it went to. */
  appNotifications(): { to: string[]; notification: AppNotification }[];
  /** Makes the messenger fail, as when the push service or the user pool is not answering. */
  fail(failing: boolean): void;
}

/** `admins` is the person ID of every Admin. */
export function createMemoryMessenger(admins: readonly string[] = []): MemoryMessenger {
  const sent: { to: string[]; notification: AppNotification }[] = [];
  let failing = false;
  const check = () => {
    if (failing) throw new Error('The messenger is not answering');
  };
  return {
    async admins() {
      check();
      return [...admins];
    },
    async sendAppNotification(to, notification) {
      check();
      sent.push(structuredClone({ to: [...to], notification }));
    },
    appNotifications: () => structuredClone(sent),
    fail(next) {
      failing = next;
    },
  };
}
