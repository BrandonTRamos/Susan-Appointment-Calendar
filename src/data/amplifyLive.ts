// Records the backend writes and nobody deletes, read straight from the data API and kept up to
// date as the scheduled run, the reply address and the commands write them: the record of every
// text to Susan, her Replies, and the calendar Alerts (amplify/data/resource.ts).

import { CONNECTION_STATE_CHANGE, ConnectionState, type generateClient } from 'aws-amplify/data';
import { Hub } from 'aws-amplify/utils';
import type { Schema } from '../../amplify/data/resource';
import type { CalendarAlert, Reply, Text } from '../lib/calendar';
import {
  toCalendarAlert,
  toReply,
  toText,
  type CalendarAlertRow,
  type ReplyRow,
  type TextRow,
} from '../lib/calendarApi';

type Client = ReturnType<typeof generateClient<Schema>>;

interface Watcher<T> {
  listener: (records: T[]) => void;
  onError: (error: Error) => void;
}

interface Heard<Row> {
  subscribe(to: { next: (row: Row) => void; error: (error: unknown) => void }): {
    unsubscribe(): void;
  };
}

/** The part of a model's client this reads: its pages, and its rows as they are created or changed. */
interface LiveModel<Row> {
  list(options: { limit: number; nextToken?: string | null }): Promise<{
    data: Row[];
    errors?: readonly { message: string }[];
    nextToken?: string | null;
  }>;
  onCreate(): Heard<Row>;
  onUpdate(): Heard<Row>;
}

/** Every text to Susan, oldest due first. */
export const liveTexts = (client: Client) =>
  liveRows<TextRow, Text>(
    () => client.models.Text as unknown as LiveModel<TextRow>,
    toText,
    (a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id),
  );

/** Every Reply, oldest first. */
export const liveReplies = (client: Client) =>
  liveRows<ReplyRow, Reply>(
    () => client.models.Reply as unknown as LiveModel<ReplyRow>,
    toReply,
    (a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id),
  );

/** Every calendar Alert, oldest first. */
export const liveCalendarAlerts = (client: Client) =>
  liveRows<CalendarAlertRow, CalendarAlert>(
    () => client.models.CalendarAlert as unknown as LiveModel<CalendarAlertRow>,
    toCalendarAlert,
    (a, b) => a.raisedAt.localeCompare(b.raisedAt) || a.id.localeCompare(b.id),
  );

function liveRows<Row extends { id: string }, T extends { id: string }>(
  modelOf: () => LiveModel<Row>,
  convert: (row: Row) => T,
  order: (a: T, b: T) => number,
) {
  const records = new Map<string, T>();
  const watchers = new Set<Watcher<T>>();
  const inOrder = (all: Iterable<T>) => [...all].sort(order);
  let read = false;
  /** What was heard while a read was under way: newer than what that read finds. */
  const heardWhileReading = new Set<Set<string>>();
  let started = 0;
  let taken = 0;
  let stopListening: (() => void) | null = null;

  function tell() {
    if (!read) return;
    const all = inOrder(records.values());
    for (const watcher of [...watchers]) watcher.listener(all);
  }

  function fail(error: unknown) {
    const failure = error instanceof Error ? error : new Error(String(error));
    for (const watcher of [...watchers]) watcher.onError(failure);
  }

  /** Keeps a record as last heard of. */
  function put(record: T) {
    records.set(record.id, record);
    for (const heard of heardWhileReading) heard.add(record.id);
    tell();
  }

  async function readAll() {
    const mine = ++started;
    const heard = new Set<string>();
    heardWhileReading.add(heard);
    try {
      const model = modelOf();
      const rows: Row[] = [];
      let nextToken: string | null | undefined;
      do {
        const page = await model.list({ limit: 1000, nextToken });
        if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join('; '));
        rows.push(...page.data);
        nextToken = page.nextToken;
      } while (nextToken);
      if (mine < taken) return;
      taken = mine;
      for (const row of rows) if (!heard.has(row.id)) records.set(row.id, convert(row));
      read = true;
      tell();
    } catch (error) {
      if (mine === started) fail(error);
    } finally {
      heardWhileReading.delete(heard);
    }
  }

  function listen() {
    const model = modelOf();
    const next = (row: Row) => put(convert(row));
    const heard = [
      model.onCreate().subscribe({ next, error: fail }),
      model.onUpdate().subscribe({ next, error: fail }),
    ];
    // Changes made while the connection was down are not heard, so it reads again on connecting.
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

  return {
    put,
    watch(listener: Watcher<T>['listener'], onError: Watcher<T>['onError']) {
      const watcher = { listener, onError };
      watchers.add(watcher);
      stopListening ??= listen();
      if (read) listener(inOrder(records.values()));
      void readAll();
      return () => {
        watchers.delete(watcher);
        if (watchers.size > 0) return;
        stopListening?.();
        stopListening = null;
      };
    },
  };
}
