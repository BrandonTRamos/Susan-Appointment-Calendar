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

// Tapping a notification opens what it is about: the open app is brought forward and told where to
// go (useNotificationTaps in src/lib/useNotificationTaps.ts), or the app is opened there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const sent = event.notification.data && event.notification.data.url;
  const url =
    typeof sent === 'string' && sent.startsWith('/') && !sent.startsWith('//') ? sent : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const window of windows) {
        if (!('focus' in window)) continue;
        window.postMessage({ type: 'open', url });
        return window.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
