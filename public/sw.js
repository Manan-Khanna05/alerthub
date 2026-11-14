/* AlertHub service worker — cache + push handling. */

const CACHE_NAME = 'alerthub-v15';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // Tolerate per-file failures so one bad file cannot break install.
        Promise.all(
          PRECACHE.map((url) => cache.add(url).catch(() => undefined)),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('alerthub-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Navigations: network-first, fall back to cache, then cached index.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/index.html')),
        ),
    );
    return;
  }

  // Static assets: cache-first with a network update.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

/**
 * Build a UNIQUE tag for this event so a genuinely new event never replaces
 * an earlier notification in place. A reused tag would silently replace the
 * old notification (and, without renotify, without alerting again).
 * The server may supply its own unique tag; otherwise derive one from the
 * event type + id: marks-update-{eventId}, gmail-{messageId},
 * task-{taskId}, system-{eventId}.
 */
function tagFor(data) {
  if (data.tag) return String(data.tag);
  const id =
    data.alertId ?? data.messageId ?? data.taskId ?? data.externalId ?? Date.now();
  switch (data.sourceType) {
    case 'cuims':
      return `marks-update-${id}`;
    case 'email':
      return `gmail-${id}`;
    case 'task':
      return `task-${id}`;
    case 'system':
      return `system-${id}`;
    default:
      return `alerthub-${id}`;
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }
  const title = data.title || 'AlertHub';
  const severity = data.severity || 'normal';
  // Only critical / important alerts demand attention: they vibrate and, on
  // platforms that honour it, stay until dismissed. (requireInteraction is
  // ignored on Android — see the Devices page diagnostics.)
  const isImportant = severity === 'critical' || severity === 'important';
  const options = {
    body: data.body || 'You have a new alert.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: tagFor(data),
    timestamp:
      typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
    // A replaced notification re-alerts instead of updating silently.
    renotify: true,
    requireInteraction: isImportant,
    // NOTE: there is no priority/importance option in the Web Notifications
    // API — showNotification() cannot set one. Heads-up display on Android
    // is decided by the OS notification channel + device state, not by this
    // code. `vibrate` is a real NotificationOptions member and is the one
    // signal Chrome on Android is known to take into account when mapping a
    // web notification onto its channel; it is best-effort, not a guarantee.
    // `silent` is deliberately never set: ordinary alerts must make sound /
    // vibrate, never arrive silently.
    data: {
      url: data.url || '/',
      alertId: data.alertId ?? null,
      severity,
    },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
  if (isImportant) {
    options.vibrate = [200, 100, 200];
  }
  const alertId = data.alertId ?? null;
  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // The notification is now displayed. Tell every open client so the
      // app can record telemetry (localStorage) and show its foreground
      // banner. When the app is closed there are no clients — nothing to
      // tell, and the system notification still stands on its own.
      const at = new Date().toISOString();
      return self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          clientList.forEach((client) => {
            client.postMessage({ type: 'push-received', alertId, at });
            client.postMessage({ type: 'notification-shown', alertId, at });
          });
        });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // "Dismiss" only closes the notification — nothing else happens.
  if (event.action === 'dismiss') return;
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        let target = url;
        try {
          target = new URL(url, self.location.origin).href;
        } catch {
          target = `${self.location.origin}/`;
        }
        // Navigate an existing same-origin client to the alert instead of
        // merely focusing whatever window happens to be first.
        for (const client of clientList) {
          if (client.url && client.url.startsWith(self.location.origin)) {
            if ('navigate' in client && typeof client.navigate === 'function') {
              try {
                await client.navigate(target);
              } catch {
                // Navigation failed — still focus the client below.
              }
            }
            if ('focus' in client) return client.focus();
            return client;
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      }),
  );
});
