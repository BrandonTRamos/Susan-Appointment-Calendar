// The record of every text to Susan, read straight from the data API (the Text model in
// amplify/data/resource.ts) and kept up to date as the scheduled run and the commands write it.

import { CONNECTION_STATE_CHANGE, ConnectionState, type generateClient } from 'aws-amplify/data';
import { Hub } from 'aws-amplify/utils';
import type { Schema } from '../../amplify/data/resource';
import type { Text } from '../lib/calendar';
import { toText, type TextRow } from '../lib/calendarApi';

type Client = ReturnType<typeof generateClient<Schema>>;

interface Watcher {
  listener: (texts: Text[]) => void;
  onError: (error: Error) => void;
}

const inOrder = (texts: Iterable<Text>) =>
  [...texts].sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));

export function liveTexts(client: Client) {
  const model = client.models.Text;
  const texts = new Map<string, Text>();
  const watchers = new Set<Watcher>();
  let read = false;
  /** What was heard while a read was under way: newer than what that read finds. */
  const heardWhileReading = new Set<Set<string>>();
  let started = 0;
  let taken = 0;
  let stopListening: (() => void) | null = null;

  function tell() {
    if (!read) return;
    const all = inOrder(texts.values());
    for (const watcher of [...watchers]) watcher.listener(all);
  }

  function fail(error: unknown) {
    const failure = error instanceof Error ? error : new Error(String(error));
    for (const watcher of [...watchers]) watcher.onError(failure);
  }

  /** Keeps a text as last heard of. */
  function put(text: Text) {
    texts.set(text.id, text);
    for (const heard of heardWhileReading) heard.add(text.id);
    tell();
  }

  async function readAll() {
    const mine = ++started;
    const heard = new Set<string>();
    heardWhileReading.add(heard);
    try {
      const rows: TextRow[] = [];
      let nextToken: string | null | undefined;
      do {
        const page = await model.list({ limit: 1000, nextToken });
        if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join('; '));
        rows.push(...page.data);
        nextToken = page.nextToken;
      } while (nextToken);
      if (mine < taken) return;
      taken = mine;
      for (const row of rows) if (!heard.has(row.id)) texts.set(row.id, toText(row));
      read = true;
      tell();
    } catch (error) {
      if (mine === started) fail(error);
    } finally {
      heardWhileReading.delete(heard);
    }
  }

  function listen() {
    const next = (row: TextRow) => put(toText(row));
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
    watch(listener: Watcher['listener'], onError: Watcher['onError']) {
      const watcher = { listener, onError };
      watchers.add(watcher);
      stopListening ??= listen();
      if (read) listener(inOrder(texts.values()));
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
