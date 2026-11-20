import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarRefusal, type Appointment } from '../lib/calendar';

// Stands in for the data API: a list that is read in pages, changes that can be announced as if
// another person had made them, and the command mutations.
const api = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string };
  type Heard = { next: (row: Row) => void; error: (error: unknown) => void };
  const listening = {
    onCreate: new Set<Heard>(),
    onUpdate: new Set<Heard>(),
    onDelete: new Set<Heard>(),
  };
  const subscription = (heard: Set<Heard>) => () => ({
    subscribe(to: Heard) {
      heard.add(to);
      return { unsubscribe: () => heard.delete(to) };
    },
  });
  return {
    pages: [] as Row[][],
    list: vi.fn(),
    listening,
    mutations: {
      addAppointment: vi.fn(),
      changeAppointment: vi.fn(),
      cancelAppointment: vi.fn(),
      removeAppointment: vi.fn(),
      addSeries: vi.fn(),
      changeSeries: vi.fn(),
      endSeries: vi.fn(),
      makeSubscriptionLink: vi.fn(),
      switchOffSubscriptionLink: vi.fn(),
    },
    links: vi.fn(),
    series: vi.fn(),
    hub: undefined as undefined | ((event: { payload: { event: string; data: unknown } }) => void),
    model: {
      onCreate: subscription(listening.onCreate),
      onUpdate: subscription(listening.onUpdate),
      onDelete: subscription(listening.onDelete),
    },
  };
});
vi.mock('aws-amplify/data', async (original) => ({
  ...(await original<typeof import('aws-amplify/data')>()),
  generateClient: () => ({
    models: {
      Appointment: { ...api.model, list: api.list },
      SubscriptionLink: { list: api.links },
      Series: { get: api.series },
    },
    mutations: api.mutations,
  }),
}));
vi.mock('aws-amplify/utils', () => ({
  Hub: {
    listen: (_channel: string, listener: typeof api.hub) => {
      api.hub = listener;
      return () => {
        api.hub = undefined;
      };
    },
  },
}));

const { createAmplifyCalendar } = await import('./amplifyCalendar');

const linda = { personId: 'person-linda', personName: 'Linda', viaAgent: false };
function appointment(what: string, date: string, changes: Partial<Appointment> = {}): Appointment {
  return {
    id: what.toLowerCase().replace(/\W+/g, '-'),
    what,
    date,
    time: '14:00',
    startsAt: `${date}T19:00:00.000Z`,
    withWhom: null,
    placeName: null,
    placeAddress: null,
    driverName: null,
    pickupTime: null,
    noteForSusan: null,
    privateNotes: null,
    state: 'active',
    reminders: [],
    series: null,
    added: { ...linda, at: '2026-11-19T20:00:00.000Z' },
    lastChanged: null,
    ...changes,
  };
}
/** An Appointment as the data API hands it over: with its own fields beside the calendar's. */
const row = (kept: Appointment) => ({
  ...kept,
  createdAt: '2026-11-19T20:00:01.000Z',
  updatedAt: '2026-11-19T20:00:01.000Z',
});

const checkUp = appointment('Cardiology check-up', '2026-11-20');
const bloodDraw = appointment('Blood draw', '2026-11-23');
const eyeExam = appointment('Eye exam', '2026-12-01');

/** Someone else's change, as the data API announces it. */
const announce = (kind: keyof typeof api.listening, kept: Appointment) => {
  for (const heard of api.listening[kind]) heard.next(row(kept));
};
const connection = (connectionState: string) =>
  api.hub?.({ payload: { event: 'ConnectionStateChange', data: { connectionState } } });
const settled = () => new Promise((resolve) => setTimeout(resolve));

/** Watches the calendar; `seen` is each list the watcher was told, as what the Appointments are. */
const FEED = 'https://abc123.lambda-url.us-east-1.on.aws/';

function watch(calendar = createAmplifyCalendar(FEED)) {
  const seen: string[][] = [];
  const latest: { appointments: Appointment[] } = { appointments: [] };
  const onError = vi.fn();
  const stop = calendar.watchAppointments((all) => {
    latest.appointments = all;
    seen.push(all.map((each) => each.what));
  }, onError);
  return { calendar, seen, latest, onError, stop };
}

beforeEach(() => {
  api.pages = [[row(eyeExam), row(checkUp)]];
  for (const heard of Object.values(api.listening)) heard.clear();
  let page = 0;
  api.list.mockReset().mockImplementation(async ({ nextToken }: { nextToken?: string | null }) => {
    if (!nextToken) page = 0;
    const data = api.pages[page++];
    return { data, nextToken: page < api.pages.length ? `page-${page}` : null };
  });
  for (const mutation of Object.values(api.mutations)) mutation.mockReset();
  api.links.mockReset();
});

describe('reading the calendar', () => {
  it('tells a watcher every Appointment, in date order, as the calendar names them', async () => {
    api.pages = [[row(eyeExam)], [row(checkUp)], [row(bloodDraw)]];
    const { seen, latest } = watch();
    await settled();
    expect(seen).toEqual([['Cardiology check-up', 'Blood draw', 'Eye exam']]);
    expect(latest.appointments[0]).toEqual(checkUp);
  });

  it('shows the calendar as soon as it is first read, though it is read again as the connection opens', async () => {
    const answers: ((page: unknown) => void)[] = [];
    api.list.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const { seen } = watch();
    connection('Connected');
    expect(answers).toHaveLength(2);
    answers[0]({ data: [row(checkUp)], nextToken: null });
    await settled();
    expect(seen).toEqual([['Cardiology check-up']]);
    answers[1]({ data: [row(checkUp), row(bloodDraw)], nextToken: null });
    await settled();
    expect(seen.at(-1)).toEqual(['Cardiology check-up', 'Blood draw']);
  });

  it('never goes back to an older reading that arrives late', async () => {
    const answers: ((page: unknown) => void)[] = [];
    api.list.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const { seen } = watch();
    connection('Connected');
    answers[1]({ data: [row(checkUp), row(bloodDraw)], nextToken: null });
    await settled();
    answers[0]({ data: [row(checkUp)], nextToken: null });
    await settled();
    expect(seen).toEqual([['Cardiology check-up', 'Blood draw']]);
  });

  it('says so when the calendar cannot be read', async () => {
    api.list.mockResolvedValue({ data: [], errors: [{ message: 'Unauthorized' }] });
    const { seen, onError } = watch();
    await settled();
    expect(seen).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("another person's change", () => {
  it('appears without the calendar being read again', async () => {
    const { seen, latest } = watch();
    await settled();
    announce('onCreate', bloodDraw);
    announce('onUpdate', { ...checkUp, time: '15:30', startsAt: '2026-11-20T20:30:00.000Z' });
    announce('onDelete', eyeExam);
    expect(seen).toEqual([
      ['Cardiology check-up', 'Eye exam'],
      ['Cardiology check-up', 'Blood draw', 'Eye exam'],
      ['Cardiology check-up', 'Blood draw', 'Eye exam'],
      ['Cardiology check-up', 'Blood draw'],
    ]);
    expect(latest.appointments[0].time).toBe('15:30');
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('is not lost when it arrives while the calendar is still being read', async () => {
    let finish!: (page: unknown) => void;
    api.list.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { seen } = watch();
    // The list was read before these happened, so it still has the old Eye exam and no Blood draw.
    announce('onCreate', bloodDraw);
    announce('onDelete', eyeExam);
    finish({ data: [row(eyeExam), row(checkUp)], nextToken: null });
    await settled();
    expect(seen).toEqual([['Cardiology check-up', 'Blood draw']]);
  });

  it('is caught up on once the connection is open, and each time it drops and comes back', async () => {
    const { seen } = watch();
    await settled();
    // Mark's change landed after the calendar was read and before changes could be heard.
    api.pages = [[row(eyeExam), row(checkUp), row(bloodDraw)]];
    connection('Connecting');
    connection('Connected');
    await settled();
    expect(seen.at(-1)).toEqual(['Cardiology check-up', 'Blood draw', 'Eye exam']);

    connection('ConnectionDisrupted');
    api.pages = [[row(checkUp), row(bloodDraw)]];
    connection('Connecting');
    expect(api.list).toHaveBeenCalledTimes(2);
    connection('Connected');
    await settled();
    expect(api.list).toHaveBeenCalledTimes(3);
    expect(seen.at(-1)).toEqual(['Cardiology check-up', 'Blood draw']);
  });

  it('is caught up on after a drop even when the app had been away and come back first', async () => {
    const first = watch();
    await settled();
    connection('Connected');
    await settled();
    // Returning to the app watches again; the connection is still open, so nothing is announced.
    first.stop();
    const again = watch(first.calendar);
    await settled();
    const reads = api.list.mock.calls.length;
    connection('ConnectionDisrupted');
    api.pages = [[row(checkUp)]];
    connection('Connected');
    await settled();
    expect(api.list).toHaveBeenCalledTimes(reads + 1);
    expect(again.seen.at(-1)).toEqual(['Cardiology check-up']);
  });

  it('is caught up on when the calendar is watched again, as on returning to the app', async () => {
    const first = watch();
    await settled();
    first.stop();
    api.pages = [[row(checkUp)]];
    const again = watch(first.calendar);
    // What was known shows at once, then what is true now.
    expect(again.seen).toEqual([['Cardiology check-up', 'Eye exam']]);
    await settled();
    expect(again.seen.at(-1)).toEqual(['Cardiology check-up']);
  });

  it('stops being listened for once nobody is watching', async () => {
    const { stop, seen } = watch();
    await settled();
    stop();
    expect(Object.values(api.listening).map((heard) => heard.size)).toEqual([0, 0, 0]);
    expect(api.hub).toBeUndefined();
    expect(seen).toHaveLength(1);
  });

  it('says so when changes can no longer be heard', async () => {
    const { onError } = watch();
    await settled();
    for (const heard of api.listening.onUpdate) heard.error(new Error('Connection closed'));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('a Series', () => {
  const place = {
    id: 'series-1',
    date: '2026-11-23',
    repeat: { every: 'week' as const, interval: 1, weekdays: [0, 3] },
    individuallyChanged: false,
  };
  const dialysis = appointment('Dialysis', '2026-11-23', { series: place });

  it("is added, changed and ended by the core's mutations, showing what they answer at once", async () => {
    const { calendar, seen } = watch();
    await settled();
    api.mutations.addSeries.mockResolvedValue({ data: { appointment: dialysis } });
    const details = {
      what: 'Dialysis',
      date: '2026-11-23',
      time: '14:00',
      repeat: { every: 'week' as const, weekdays: [0, 3] },
    };
    expect(await calendar.addSeries(details, 'series-1')).toEqual(dialysis);
    expect(api.mutations.addSeries).toHaveBeenCalledWith({
      id: 'series-1',
      details: JSON.stringify(details),
    });
    expect(seen.at(-1)).toContain('Dialysis');

    const later = { ...dialysis, time: '15:00' };
    api.mutations.changeSeries.mockResolvedValue({ data: { appointment: later } });
    expect(await calendar.changeSeries(dialysis.id, { time: '15:00' })).toEqual(later);
    expect(api.mutations.changeSeries).toHaveBeenCalledWith({
      id: dialysis.id,
      changes: JSON.stringify({ time: '15:00' }),
    });

    api.mutations.endSeries.mockResolvedValue({
      data: { appointment: { ...later, state: 'cancelled' } },
    });
    expect((await calendar.endSeries(dialysis.id)).state).toBe('cancelled');
  });

  it('is read once, as the data API carries it', async () => {
    const calendar = createAmplifyCalendar(FEED);
    api.series.mockResolvedValue({
      data: {
        id: 'series-1',
        what: 'Dialysis',
        time: '09:00',
        repeat: { every: 'week', interval: 1, weekdays: [0, 3], day: null },
        starts: '2026-11-23',
        ends: null,
        reminders: [{ shape: 'daysBefore', days: 1, time: '18:00', amount: null, unit: null }],
        madeThrough: '2027-05-24',
        added: { personId: 'person-linda', personName: 'Linda', viaAgent: false, at: 'x' },
        lastChanged: null,
        createdAt: 'x',
        updatedAt: 'x',
      },
    });
    expect(await calendar.series('series-1')).toMatchObject({
      what: 'Dialysis',
      withWhom: null,
      repeat: { every: 'week', interval: 1, weekdays: [0, 3] },
      ends: null,
      reminders: [{ shape: 'daysBefore', days: 1, time: '18:00' }],
    });
    api.series.mockResolvedValue({ data: null });
    expect(await calendar.series('none')).toBeNull();
  });
});

describe('the commands', () => {
  it("are the core's mutations, and what they answer shows at once", async () => {
    const { calendar, seen } = watch();
    await settled();

    api.mutations.addAppointment.mockResolvedValue({
      data: JSON.stringify({ appointment: bloodDraw }),
    });
    const details = { what: 'Blood draw', date: '2026-11-23', time: '14:00' };
    expect(await calendar.addAppointment(details, bloodDraw.id)).toEqual(bloodDraw);
    expect(api.mutations.addAppointment).toHaveBeenCalledWith({
      id: bloodDraw.id,
      details: JSON.stringify(details),
    });
    expect(seen.at(-1)).toEqual(['Cardiology check-up', 'Blood draw', 'Eye exam']);

    const moved = { ...bloodDraw, date: '2026-12-02', startsAt: '2026-12-02T19:00:00.000Z' };
    api.mutations.changeAppointment.mockResolvedValue({ data: { appointment: moved } });
    expect(await calendar.changeAppointment(bloodDraw.id, { date: '2026-12-02' })).toEqual(moved);
    expect(api.mutations.changeAppointment).toHaveBeenCalledWith({
      id: bloodDraw.id,
      changes: JSON.stringify({ date: '2026-12-02' }),
    });
    expect(seen.at(-1)).toEqual(['Cardiology check-up', 'Eye exam', 'Blood draw']);

    const cancelled = { ...moved, state: 'cancelled' as const };
    api.mutations.cancelAppointment.mockResolvedValue({ data: { appointment: cancelled } });
    expect((await calendar.cancelAppointment(bloodDraw.id)).state).toBe('cancelled');
    expect(api.mutations.cancelAppointment).toHaveBeenCalledWith({ id: bloodDraw.id });

    api.mutations.removeAppointment.mockResolvedValue({ data: { appointment: null } });
    await calendar.deleteAppointment(bloodDraw.id);
    expect(api.mutations.removeAppointment).toHaveBeenCalledWith({ id: bloodDraw.id });
    expect(seen.at(-1)).toEqual(['Cardiology check-up', 'Eye exam']);
  });

  it("reject with the core's refusal, and change nothing on screen", async () => {
    const { calendar, seen } = watch();
    await settled();
    const refusal = {
      reason: 'texted',
      message:
        'Susan has already been texted about this Appointment, so it cannot be deleted. Cancel it instead.',
    };
    api.mutations.removeAppointment.mockResolvedValue({ data: JSON.stringify({ refusal }) });
    const error = await calendar.deleteAppointment(checkUp.id).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(CalendarRefusal);
    expect(error).toMatchObject(refusal);

    api.mutations.addAppointment.mockResolvedValue({
      data: { refusal: { reason: 'invalid', message: 'Pick the date.', detail: 'date' } },
    });
    await expect(
      calendar.addAppointment({ what: 'Hair', date: '', time: '11:00' }),
    ).rejects.toMatchObject({ reason: 'invalid', message: 'Pick the date.', detail: 'date' });
    expect(seen).toHaveLength(1);
  });

  it.each([
    [
      'the data API reports an error',
      () => Promise.resolve({ data: null, errors: [{ message: 'Lambda:Unhandled' }] }),
    ],
    ['there is no connection', () => Promise.reject(new Error('Network Error'))],
    ['nothing comes back', () => Promise.resolve({ data: null })],
  ])('say to try again when %s', async (_when, answer) => {
    const { calendar, seen } = watch();
    await settled();
    api.mutations.cancelAppointment.mockImplementation(answer);
    const error = await calendar.cancelAppointment(checkUp.id).catch((thrown: unknown) => thrown);
    expect(error).not.toBeInstanceOf(CalendarRefusal);
    expect((error as Error).message).toBe(
      'Could not save the change. Check your connection and try again.',
    );
    expect(seen).toHaveLength(1);
  });
});

describe("the signed-in person's subscription link", () => {
  const secret = 'Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5';

  it('is read from the data API, which hands a person only their own', async () => {
    const calendar = createAmplifyCalendar(FEED);
    api.links.mockResolvedValueOnce({ data: [] });
    expect(await calendar.subscriptionLink()).toBeNull();
    api.links.mockResolvedValueOnce({ data: [], nextToken: 'more' }).mockResolvedValueOnce({
      data: [{ personId: 'person-linda', hash: 'ab', madeAt: '2026-11-19T20:00:00.000Z' }],
    });
    expect(await calendar.subscriptionLink()).toEqual({ madeAt: '2026-11-19T20:00:00.000Z' });
  });

  it("is made by the core's command, and its address is the feed's with the secret", async () => {
    const calendar = createAmplifyCalendar(FEED);
    api.mutations.makeSubscriptionLink.mockResolvedValue({
      data: JSON.stringify({ subscriptionLink: { secret, madeAt: '2026-11-19T20:00:00.000Z' } }),
    });
    expect(await calendar.makeSubscriptionLink()).toEqual({
      address: `${FEED}${secret}`,
      madeAt: '2026-11-19T20:00:00.000Z',
    });
    api.mutations.switchOffSubscriptionLink.mockResolvedValue({
      data: { subscriptionLink: null },
    });
    await calendar.switchOffSubscriptionLink();
    expect(api.mutations.switchOffSubscriptionLink).toHaveBeenCalled();
  });

  it('cannot be made when the backend has no feed, and says so', async () => {
    await expect(createAmplifyCalendar(null).makeSubscriptionLink()).rejects.toThrow(
      'Calendar subscription is not set up yet.',
    );
    expect(api.mutations.makeSubscriptionLink).not.toHaveBeenCalled();
  });

  it('says to try again when the command fails', async () => {
    api.mutations.switchOffSubscriptionLink.mockRejectedValue(new Error('Network Error'));
    await expect(createAmplifyCalendar(FEED).switchOffSubscriptionLink()).rejects.toThrow(
      'Could not save the change. Check your connection and try again.',
    );
  });
});
