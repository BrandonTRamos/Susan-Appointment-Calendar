import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// The service worker's app notification handlers (public/app-notifications-sw.js), run against a
// stand-in for the worker's `self`.
const source = readFileSync(
  new URL('../../public/app-notifications-sw.js', import.meta.url),
  'utf8',
);

function worker(windows: { postMessage: (m: unknown) => void; focus: () => unknown }[] = []) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      (handlers[type] = handler),
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) =>
        void shown.push({ title, options }),
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => void opened.push(url),
    },
  };
  new Function('self', source)(self);

  /** Hands an event to the worker and waits for what it said to wait for. */
  async function fire(type: string, event: object) {
    let waiting: Promise<unknown> = Promise.resolve();
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => (waiting = p) });
    await waiting;
  }
  return { shown, opened, fire };
}

const update = {
  title: "Susan's Calendar",
  body: 'Linda added Eye exam, Mon, Nov 23, 2026 at 3:30 pm.',
  url: '/appointments/a1',
  tag: 'appointment-a1',
};

describe('an app notification on a device', () => {
  it('shows what the backend sent, and remembers what to open', async () => {
    const { shown, fire } = worker();
    await fire('push', { data: { json: () => update } });
    expect(shown).toEqual([
      {
        title: "Susan's Calendar",
        options: expect.objectContaining({
          body: update.body,
          tag: 'appointment-a1',
          data: { url: '/appointments/a1' },
        }),
      },
    ]);
  });

  it('opens the app at the Appointment when tapped while the app is closed', async () => {
    const { opened, fire } = worker();
    const close = vi.fn();
    await fire('notificationclick', { notification: { close, data: { url: '/appointments/a1' } } });
    expect(close).toHaveBeenCalled();
    expect(opened).toEqual(['/appointments/a1']);
  });

  it('brings the open app forward and tells it what to open', async () => {
    const open = { postMessage: vi.fn(), focus: vi.fn() };
    const { opened, fire } = worker([open]);
    await fire('notificationclick', {
      notification: { close: () => {}, data: { url: '/appointments/a1' } },
    });
    expect(open.postMessage).toHaveBeenCalledWith({ type: 'open', url: '/appointments/a1' });
    expect(open.focus).toHaveBeenCalled();
    expect(opened).toEqual([]);
  });

  it('opens nothing outside the app', async () => {
    const { opened, fire } = worker();
    await fire('notificationclick', {
      notification: { close: () => {}, data: { url: 'https://example.com/' } },
    });
    expect(opened).toEqual(['/']);
  });
});
