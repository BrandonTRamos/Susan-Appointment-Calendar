// The calendar over the data API (amplify/data/resource.ts). Appointments are read directly and
// kept up to date as anyone changes them; the calendar is changed only by calling the calendar
// core's commands, which are the data API's custom mutations.

import { CONNECTION_STATE_CHANGE, ConnectionState, generateClient } from 'aws-amplify/data';
import { Hub } from 'aws-amplify/utils';
import type { Schema } from '../../amplify/data/resource';
import {
  CalendarRefusal,
  inDateOrder,
  NO_SETTINGS,
  subscriptionAddress,
  type Appointment,
} from '../lib/calendar';
import {
  COMMAND_FAILED,
  SETTINGS_ID,
  toAppointment,
  toSeries,
  toSettings,
  type AppointmentRow,
  type CommandAnswer,
} from '../lib/calendarApi';
import { liveCalendarAlerts, liveReplies, liveTexts } from './amplifyLive';
import { newestFirst, NO_FEED, type AgentKeyListing, type CalendarClient } from './calendarClient';

interface Watcher {
  listener: (appointments: Appointment[]) => void;
  onError: (error: Error) => void;
}

interface Answer {
  data?: unknown;
  errors?: readonly { message: string }[];
}

/** What a command did, from the mutation's answer, or a throw: the core's refusal, or a failure. */
function carriedOut(answer: Answer): Exclude<CommandAnswer, { refusal: unknown }> {
  if (answer.errors?.length || answer.data == null) throw new Error(COMMAND_FAILED);
  const said = (
    typeof answer.data === 'string' ? JSON.parse(answer.data) : answer.data
  ) as CommandAnswer;
  if ('refusal' in said) {
    const { reason, message, detail } = said.refusal;
    throw new CalendarRefusal(reason, message, detail);
  }
  return said;
}

/** Calls a command, and answers with what it did. */
async function command(call: () => Promise<Answer>) {
  let answer: Answer;
  try {
    answer = await call();
  } catch {
    throw new Error(COMMAND_FAILED);
  }
  return carriedOut(answer);
}

/**
 * The calendar over the data API. `feedUrl` is the subscription feed's address, and `mcpEndpoint`
 * the MCP server's, from the backend's outputs (src/config.ts); null when the backend has none.
 */
export function createAmplifyCalendar(
  feedUrl: string | null,
  mcpEndpoint: string | null = null,
): CalendarClient {
  const client = generateClient<Schema>();
  const texts = liveTexts(client);
  const replies = liveReplies(client);
  const calendarAlerts = liveCalendarAlerts(client);
  const model = client.models.Appointment;

  /** Every Appointment, as last heard. */
  const appointments = new Map<string, Appointment>();
  const watchers = new Set<Watcher>();
  /** Whether the whole calendar has been read at least once. Nothing is shown before that. */
  let read = false;
  /** For each read still under way: what changed meanwhile, which is newer than what it reads. */
  const changedWhileReading = new Set<Set<string>>();
  /** Reads are numbered as they start. The newest one taken so far is `taken`. */
  let started = 0;
  let taken = 0;
  let stopListening: (() => void) | null = null;

  function tell() {
    if (!read) return;
    const all = inDateOrder([...appointments.values()]);
    for (const watcher of [...watchers]) watcher.listener(all);
  }
  function fail(error: unknown) {
    const failure = error instanceof Error ? error : new Error(String(error));
    for (const watcher of [...watchers]) watcher.onError(failure);
  }
  function put(appointment: Appointment) {
    appointments.set(appointment.id, appointment);
    for (const changed of changedWhileReading) changed.add(appointment.id);
    tell();
  }
  function drop(id: string) {
    appointments.delete(id);
    for (const changed of changedWhileReading) changed.add(id);
    tell();
  }

  /**
   * Reads the whole calendar. Changes heard while it is being read win over what it reads. Reads
   * can overlap, as when the connection opens while the first is under way: each is taken as it
   * arrives, unless a later one already has been.
   */
  async function readAll() {
    const mine = ++started;
    const changed = new Set<string>();
    changedWhileReading.add(changed);
    try {
      const rows: AppointmentRow[] = [];
      let nextToken: string | null | undefined;
      do {
        const page = await model.list({ limit: 1000, nextToken });
        if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join('; '));
        rows.push(...page.data);
        nextToken = page.nextToken;
      } while (nextToken);
      if (mine < taken) return;
      taken = mine;
      for (const id of [...appointments.keys()]) if (!changed.has(id)) appointments.delete(id);
      for (const row of rows)
        if (!changed.has(row.id)) appointments.set(row.id, toAppointment(row));
      read = true;
      tell();
    } catch (error) {
      // Only the latest read failing means the calendar may be out of date.
      if (mine === started) fail(error);
    } finally {
      changedWhileReading.delete(changed);
    }
  }

  /**
   * Hears every change as it happens. Changes made while the connection was opening, or while it
   * had dropped, are not heard, so the calendar is read again each time it connects.
   */
  function listen() {
    const next = (row: AppointmentRow) => put(toAppointment(row));
    const heard = [
      model.onCreate().subscribe({ next, error: fail }),
      model.onUpdate().subscribe({ next, error: fail }),
      model.onDelete().subscribe({ next: (row) => drop(row.id), error: fail }),
    ];
    const stopHub = Hub.listen('api', ({ payload }) => {
      if (payload.event !== CONNECTION_STATE_CHANGE) return;
      const { connectionState } = payload.data as { connectionState: ConnectionState };
      if (connectionState === ConnectionState.Connected) void readAll();
    });
    return () => {
      for (const subscription of heard) subscription.unsubscribe();
      stopHub();
    };
  }

  /** Calls a command and keeps what it answers, so the screen need not wait to hear of it. */
  async function changed(call: () => Promise<Answer>): Promise<Appointment> {
    const said = await command(call);
    const appointment = 'appointment' in said ? said.appointment : null;
    if (!appointment) throw new Error(COMMAND_FAILED);
    put(appointment);
    return appointment;
  }

  return {
    watchAppointments(listener, onError) {
      const watcher = { listener, onError };
      watchers.add(watcher);
      stopListening ??= listen();
      // Every new watch reads afresh: the app starts one whenever it comes back to the foreground.
      if (read) listener(inDateOrder([...appointments.values()]));
      void readAll();
      return () => {
        watchers.delete(watcher);
        if (watchers.size > 0) return;
        stopListening?.();
        stopListening = null;
      };
    },
    addAppointment: (details, id) =>
      changed(() => client.mutations.addAppointment({ id, details: JSON.stringify(details) })),
    changeAppointment: (id, changes) =>
      changed(() => client.mutations.changeAppointment({ id, changes: JSON.stringify(changes) })),
    cancelAppointment: (id) => changed(() => client.mutations.cancelAppointment({ id })),
    // The rest of a Series' Appointments, and those it changed, arrive as they are kept.
    addSeries: (details, id) =>
      changed(() => client.mutations.addSeries({ id, details: JSON.stringify(details) })),
    changeSeries: (id, changes) =>
      changed(() => client.mutations.changeSeries({ id, changes: JSON.stringify(changes) })),
    endSeries: (id) => changed(() => client.mutations.endSeries({ id })),
    async series(id) {
      const { data, errors } = await client.models.Series.get({ id });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
      return data ? toSeries(data) : null;
    },
    async deleteAppointment(id) {
      await command(() => client.mutations.removeAppointment({ id }));
      drop(id);
    },

    // A signed-in person can read only their own link, so the first one found is theirs.
    async subscriptionLink() {
      let nextToken: string | null | undefined;
      do {
        const page = await client.models.SubscriptionLink.list({ nextToken });
        if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join('; '));
        if (page.data[0]) return { madeAt: page.data[0].madeAt };
        nextToken = page.nextToken;
      } while (nextToken);
      return null;
    },
    async makeSubscriptionLink() {
      if (!feedUrl) throw new Error(NO_FEED);
      const said = await command(() => client.mutations.makeSubscriptionLink());
      const made = 'subscriptionLink' in said ? said.subscriptionLink : null;
      if (!made) throw new Error(COMMAND_FAILED);
      return { address: subscriptionAddress(feedUrl, made.secret), madeAt: made.madeAt };
    },
    async switchOffSubscriptionLink() {
      await command(() => client.mutations.switchOffSubscriptionLink());
    },

    // A signed-in person can read only their own keys.
    async agentKeys() {
      const keys: AgentKeyListing[] = [];
      let nextToken: string | null | undefined;
      do {
        const page = await client.models.AgentKey.list({ nextToken });
        if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join('; '));
        for (const { hash, name, madeAt } of page.data) keys.push({ hash, name, madeAt });
        nextToken = page.nextToken;
      } while (nextToken);
      return newestFirst(keys);
    },
    async makeAgentKey(name) {
      const said = await command(() => client.mutations.makeAgentKey({ name }));
      const made = 'agentKey' in said ? said.agentKey : null;
      if (!made) throw new Error(COMMAND_FAILED);
      return made;
    },
    async revokeAgentKey(hash) {
      await command(() => client.mutations.revokeAgentKey({ hash }));
    },
    agentEndpoint: () => mcpEndpoint,

    async textsRecordedOnly() {
      const { data, errors } = await client.queries.textSender();
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
      return data !== 'textbelt';
    },
    watchTexts: (listener, onError) => texts.watch(listener, onError),
    async settings() {
      const { data, errors } = await client.models.CalendarSettings.get({ id: SETTINGS_ID });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
      return data ? toSettings(data) : NO_SETTINGS;
    },
    async changeSettings(changes) {
      const said = await command(() =>
        client.mutations.changeSettings({ settings: JSON.stringify(changes) }),
      );
      if (!('settings' in said)) throw new Error(COMMAND_FAILED);
      return said.settings;
    },
    async sendTestText() {
      const said = await command(() => client.mutations.sendTestText());
      if (!('text' in said)) throw new Error(COMMAND_FAILED);
      texts.put(said.text);
      return said.text;
    },

    watchReplies: (listener, onError) => replies.watch(listener, onError),
    watchCalendarAlerts: (listener, onError) => calendarAlerts.watch(listener, onError),
    // A signed-in person can read only their own, so the first one found is theirs.
    async repliesSeen() {
      let nextToken: string | null | undefined;
      do {
        const page = await client.models.RepliesSeen.list({ nextToken });
        if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join('; '));
        if (page.data[0]) return page.data[0].seenUpTo;
        nextToken = page.nextToken;
      } while (nextToken);
      return null;
    },
    async seeReplies(upTo) {
      const said = await command(() => client.mutations.seeReplies({ upTo }));
      if (!('repliesSeen' in said)) throw new Error(COMMAND_FAILED);
      return said.repliesSeen;
    },
  };
}
