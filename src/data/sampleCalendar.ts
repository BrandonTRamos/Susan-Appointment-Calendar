// The calendar on sample data, for when the app has no backend: the same calendar core as the
// backend runs, over a store kept in memory. Nothing is saved; a reload starts again.

import {
  createCalendarCore,
  createMemoryStore,
  systemClock,
  type Actor,
  type CalendarCore,
  type Clock,
  type MemoryStore,
  subscriptionAddress,
  type NewAppointment,
} from '../lib/calendar';
import { addDays, today } from '../lib/localTime';
import type { CalendarClient } from './calendarClient';

/** Nobody is signed in on sample data, so every command is carried out as this person. */
const YOU: Actor = { person: { id: 'sample-you', name: 'You' }, viaAgent: false };
const LINDA: Actor = { person: { id: 'sample-linda', name: 'Linda' }, viaAgent: false };
const MARK: Actor = { person: { id: 'sample-mark', name: 'Mark' }, viaAgent: false };

/** Where a sample link points. Nothing answers there: a sample link is only for seeing. */
export const SAMPLE_FEED_URL = 'https://feed.example.com/';

/** Invented Appointments, as [days from today, who added it, its details]. */
const SAMPLES: [number, Actor, Omit<NewAppointment, 'date'>][] = [
  [
    1,
    LINDA,
    {
      what: 'Cardiology check-up',
      time: '14:00',
      withWhom: 'Dr. Patel',
      placeName: 'Heart Clinic',
      placeAddress: '400 Main St',
      driverName: 'Linda',
      pickupTime: '13:15',
      noteForSusan: 'Bring your list of medicines.',
      privateNotes: 'Ask about the new prescription.',
      reminders: [
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'before', amount: 2, unit: 'hours' },
      ],
    },
  ],
  [5, MARK, { what: 'Blood draw', time: '09:00', placeName: 'Riverside Lab' }],
  [7, LINDA, { what: 'Hair', time: '11:00', placeName: "Maria's Salon", driverName: 'Mark' }],
  [13, MARK, { what: 'Eye exam', time: '15:30', withWhom: 'Dr. Chen' }],
  [-6, LINDA, { what: 'Flu shot', time: '10:30', placeName: 'Main Street Pharmacy' }],
];

export interface SampleCalendar extends CalendarClient {
  /** The core and store behind it, so that a test can act as someone else or look at what is kept. */
  core: CalendarCore;
  store: MemoryStore;
}

export interface SampleCalendarOptions {
  /** Start with no Appointments. */
  empty?: boolean;
  clock?: Clock;
}

export function createSampleCalendar(
  timeZone: string,
  { empty = false, clock = systemClock }: SampleCalendarOptions = {},
): SampleCalendar {
  const store = createMemoryStore();
  const core = createCalendarCore({ store, clock, timeZone });

  const day = today(timeZone, clock.now());
  const ready = (async () => {
    if (empty) return;
    for (const [days, by, details] of SAMPLES)
      await core.addAppointment(by, { ...details, date: addDays(day, days) });
  })();

  return {
    core,
    store,
    watchAppointments(listener, onError) {
      let stop: (() => void) | undefined;
      let stopped = false;
      ready.then(() => {
        if (stopped) return;
        listener(store.appointments());
        stop = store.subscribe(() => listener(store.appointments()));
      }, onError);
      return () => {
        stopped = true;
        stop?.();
      };
    },
    addAppointment: (details, id) => core.addAppointment(YOU, details, id),
    changeAppointment: (id, changes) => core.changeAppointment(YOU, id, changes),
    cancelAppointment: (id) => core.cancelAppointment(YOU, id),
    deleteAppointment: (id) => core.deleteAppointment(YOU, id),
    async subscriptionLink() {
      const link = await store.subscriptionLinkOf(YOU.person.id);
      return link && { madeAt: link.madeAt };
    },
    async makeSubscriptionLink() {
      const { secret, madeAt } = await core.makeSubscriptionLink(YOU);
      return { address: subscriptionAddress(SAMPLE_FEED_URL, secret), madeAt };
    },
    switchOffSubscriptionLink: () => core.switchOffSubscriptionLink(YOU),
  };
}
