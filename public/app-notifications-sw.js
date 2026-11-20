// App notification handlers, loaded into the generated service worker (importScripts in
// vite.config.ts). Each push carries { title, body, url, tag } (amplify/calendar/admin-messenger.ts).

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Susan's Calendar", {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

// Tapping a notification opens what it is about. A window of the app that is already open is moved
// to that address and brought forward, whatever it was showing: the calendar, a Public page or the
// sign-in screen. A window this worker cannot move, or none at all, means a new one is opened there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const sent = event.notification.data && event.notification.data.url;
  const url =
    typeof sent === 'string' && sent.startsWith('/') && !sent.startsWith('//') ? sent : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const window of windows) {
        if (typeof window.navigate !== 'function') continue;
        try {
          const moved = await window.navigate(url);
          if (moved) return moved.focus();
        } catch {
          // Not controlled by this worker, so it cannot be moved. Try the next one.
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
