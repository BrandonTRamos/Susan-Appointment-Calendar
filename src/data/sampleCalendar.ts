// The calendar on sample data, for when the app has no backend: the same calendar core as the
// backend runs, over a store kept in memory. Nothing is saved; a reload starts again.

import {
  createCalendarCore,
  createMemoryMessenger,
  createMemoryStore,
  createStandInSender,
  NEW_ALERT,
  systemClock,
  type Actor,
  type CalendarCore,
  type Clock,
  type MemoryStore,
  type StandInSender,
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

/** Susan's number on sample data: invented, as 555-01xx numbers belong to nobody. */
export const SAMPLE_NUMBER = '+15555550123';

/** How often sample data runs what is due, as the backend's scheduled run does. */
const RUN_EVERY = 60_000;

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

/**
 * Invented Replies, as [minutes before now that each came, what it says], so that the Replies tab
 * and its count show on sample data. Kept as the reply address keeps one; the first run answers and
 * passes them on, as the scheduled run does.
 */
const SAMPLE_REPLIES: [number, string][] = [
  [26 * 60, 'Thank you for the reminder'],
  [25, 'Running a little late, see you soon'],
];

export interface SampleCalendar extends CalendarClient {
  /** The core and store behind it, so that a test can act as someone else or look at what is kept. */
  core: CalendarCore;
  store: MemoryStore;
  /** The stand-in sender: on sample data, texts are recorded here and never sent. */
  sender: StandInSender;
}

export interface SampleCalendarOptions {
  /** Start with no Appointments. */
  empty?: boolean;
  clock?: Clock;
  /** Susan's number to start with; null for none. An invented one unless told otherwise. */
  susansNumber?: string | null;
}

export function createSampleCalendar(
  timeZone: string,
  { empty = false, clock = systemClock, susansNumber = SAMPLE_NUMBER }: SampleCalendarOptions = {},
): SampleCalendar {
  const store = createMemoryStore();
  // Nobody is signed in on sample data, so no device has notifications on: Activity updates are
  // worked out and go nowhere.
  const messenger = createMemoryMessenger([LINDA, MARK].map((admin) => admin.person.id));
  const sender = createStandInSender();
  const core = createCalendarCore({ store, clock, messenger, textSender: sender, timeZone });

  const day = today(timeZone, clock.now());
  const ready = (async () => {
    if (susansNumber) await core.changeSettings(YOU, { susansNumber });
    if (empty) return;
    for (const [days, by, details] of SAMPLES)
      await core.addAppointment(by, { ...details, date: addDays(day, days) });
    const { numberRevision, susansNumber: number } = await store.settings();
    if (!number) return;
    for (const [minutesAgo, words] of SAMPLE_REPLIES)
      await store.claimReply({
        id: `reply:sample-${minutesAgo}`,
        words,
        receivedAt: new Date(clock.now().getTime() - minutesAgo * 60_000).toISOString(),
        numberRevision,
        answer: 'due',
        answerTextId: null,
        passOn: NEW_ALERT,
      });
  })();

  /** Tells `listener` what `read` finds once the samples are in, and again after every change. */
  function watchStore<T>(read: () => T, listener: (found: T) => void, onError: (e: Error) => void) {
    let stop: (() => void) | undefined;
    let stopped = false;
    ready.then(() => {
      if (stopped) return;
      listener(read());
      stop = store.subscribe(() => listener(read()));
    }, onError);
    return () => {
      stopped = true;
      stop?.();
    };
  }

  // While anyone is watching the texts, what is due is run every minute, as the backend's
  // scheduled run does.
  let watchingTexts = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const run = () => void core.runDue().catch(() => {});

  return {
    core,
    store,
    sender,
    textsRecordedOnly: async () => true,
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
    addSeries: async (details, id) => (await core.addSeries(YOU, details, id)).appointments[0],
    changeSeries: (id, changes) => core.changeSeries(YOU, id, changes),
    endSeries: (id) => core.endSeries(YOU, id),
    series: (id) => store.series(id),
    async subscriptionLink() {
      const link = await store.subscriptionLinkOf(YOU.person.id);
      return link && { madeAt: link.madeAt };
    },
    async makeSubscriptionLink() {
      const { secret, madeAt } = await core.makeSubscriptionLink(YOU);
      return { address: subscriptionAddress(SAMPLE_FEED_URL, secret), madeAt };
    },
    switchOffSubscriptionLink: () => core.switchOffSubscriptionLink(YOU),
    watchTexts(listener, onError) {
      let stop: (() => void) | undefined;
      let stopped = false;
      watchingTexts += 1;
      ready.then(() => {
        if (stopped) return;
        listener(store.texts());
        stop = store.subscribe(() => listener(store.texts()));
        run();
        timer ??= setInterval(run, RUN_EVERY);
      }, onError);
      return () => {
        stopped = true;
        stop?.();
        watchingTexts -= 1;
        if (watchingTexts > 0 || !timer) return;
        clearInterval(timer);
        timer = undefined;
      };
    },
    async settings() {
      await ready;
      return store.settings();
    },
    changeSettings: (changes) => core.changeSettings(YOU, changes),
    sendTestText: () => core.sendTestText(YOU),
    watchReplies: (listener, onError) => watchStore(() => store.replies(), listener, onError),
    watchCalendarAlerts: (listener, onError) =>
      watchStore(() => store.calendarAlerts(), listener, onError),
    repliesSeen: () => store.repliesSeen(YOU.person.id),
    seeReplies: (upTo) => core.seeReplies(YOU, upTo),
  };
}
