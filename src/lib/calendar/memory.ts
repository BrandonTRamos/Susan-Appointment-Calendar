// In-memory stand-ins for the calendar core's ports. Tests drive the core against them, and the app
// runs on them when it has no backend (src/data/sampleCalendar.ts).

import { inDateOrder, type ActivityRecord, type Appointment } from './appointment';
import type {
  AdminMessenger,
  AppNotification,
  Clock,
  DeliveryReport,
  SendResult,
  Store,
  TextSender,
} from './ports';
import type { Series } from './series';
import type { SubscriptionLink } from './subscription';
import { NO_SETTINGS, type CalendarSettings, type Text } from './texts';

export interface MemoryStore extends Store {
  /** Every Appointment in the calendar, in date order. */
  appointments(): Appointment[];
  /** Every activity record, oldest first. */
  activity(): ActivityRecord[];
  /** Every Series, in the order they were added. */
  everySeriesKept(): Series[];
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
 * text instead of sending it, and logs nothing. A text it records went to no phone, so it gives it
 * no name and nobody asks what became of it: it stays sent.
 *
 * A test can make the next sends fail, either for certain (`refuseNext`) or so that nobody can tell
 * whether they went (`breakNext`). Made with `reportsDelivery`, it stands in for a sender that can
 * be asked what became of each text, as Textbelt can: it names them `stand-in-1`, `stand-in-2` and
 * so on, and answers what `report` last told it, or 'pending'.
 */
export interface StandInSender extends TextSender {
  /** Every text it took, oldest first. */
  taken(): StandInText[];
  /** The next `times` sends throw, as when the connection drops mid-send. */
  breakNext(times?: number): void;
  /** The next `times` sends are refused. */
  refuseNext(times?: number): void;
  /** From now on it is asked about the text it named `reference`, it answers `report`. */
  report(reference: string, report: DeliveryReport): void;
  /** The next `times` times it is asked about a text, it throws, as when it cannot be reached. */
  breakReports(times?: number): void;
  /** Every reference it was asked about, in order. */
  asked(): string[];
  /**
   * From now on, asking about any of these references (or, with none given, any reference) waits,
   * as a slow answer does, until `releaseReports`.
   */
  holdReports(...references: string[]): void;
  /** Answers every question held back, and holds no more. */
  releaseReports(): void;
  /**
   * Says, with each send, that this much credit is left, one less for each text it takes. Until
   * this is called it says nothing about credit.
   */
  haveCredit(credit: number): void;
}

export function createStandInSender({
  reportsDelivery = false,
}: { reportsDelivery?: boolean } = {}): StandInSender {
  const taken: StandInText[] = [];
  const reports = new Map<string, DeliveryReport>();
  const asked: string[] = [];
  let broken = 0;
  let refused = 0;
  let brokenReports = 0;
  let credit: number | null = null;
  let holding: Set<string> | 'all' | null = null;
  const held: (() => void)[] = [];
  return {
    async send({ to, words }): Promise<SendResult> {
      if (broken > 0) {
        broken -= 1;
        throw new Error('The stand-in sender was told to fail.');
      }
      if (refused > 0) {
        refused -= 1;
        return { sent: false, creditLeft: credit };
      }
      taken.push({ to, words });
      if (credit !== null) credit = Math.max(0, credit - 1);
      const reference = reportsDelivery ? `stand-in-${taken.length}` : null;
      return { sent: true, reference, creditLeft: credit };
    },
    async delivery(reference) {
      asked.push(reference);
      if (holding === 'all' || holding?.has(reference))
        await new Promise<void>((resolve) => held.push(resolve));
      if (brokenReports > 0) {
        brokenReports -= 1;
        throw new Error('The stand-in sender was told it cannot be reached.');
      }
      return reports.get(reference) ?? 'pending';
    },
    taken: () => structuredClone(taken),
    breakNext(times = 1) {
      broken += times;
    },
    refuseNext(times = 1) {
      refused += times;
    },
    report(reference, report) {
      reports.set(reference, report);
    },
    breakReports(times = 1) {
      brokenReports += times;
    },
    asked: () => [...asked],
    holdReports(...references) {
      holding = references.length ? new Set(references) : 'all';
    },
    releaseReports() {
      holding = null;
      for (const release of held.splice(0)) release();
    },
    haveCredit(next) {
      credit = next;
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
