// In-memory stand-ins for the calendar core's ports. Tests drive the core against them, and the app
// runs on them when it has no backend (src/data/sampleCalendar.ts).

import { inDateOrder, type ActivityRecord, type Appointment } from './appointment';
import type { Clock, Store } from './ports';

export interface MemoryStore extends Store {
  /** Every Appointment in the calendar, in date order. */
  appointments(): Appointment[];
  /** Every activity record, oldest first. */
  activity(): ActivityRecord[];
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
    async saveAppointment(appointment) {
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

    appointments: () => inDateOrder(structuredClone([...appointments.values()])),
    activity: () => structuredClone(activity),
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
