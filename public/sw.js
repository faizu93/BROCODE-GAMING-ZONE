/* ==========================================================================
   Bro Code Gaming Zone — push notification worker.

   Runs in the background so the owner still gets a notification when the
   dashboard tab is closed.
   ========================================================================== */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { title: 'Bro Code Gaming Zone', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Bro Code Gaming Zone';
  const url = data.url || '/admin';

  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || 'bro-code',
    renotify: true,
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || '/admin';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of windows) {
      if (client.url.includes(target) && 'focus' in client) return client.focus();
    }

    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        return client.navigate ? client.navigate(target) : undefined;
      }
    }

    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  })());
});
