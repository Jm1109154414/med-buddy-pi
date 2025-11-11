/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error('Failed to parse push data:', e);
  }

  const title = data.title || 'PillMate - Recordatorio';
  const options = {
    body: data.body || 'Hora de tu medicamento',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/badge-72.png',
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'snooze', title: 'Posponer 5 min' },
    ],
    requireInteraction: true,
    tag: 'pillmate-reminder',
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.action);
  
  event.notification.close();

  const d = event.notification.data || {};
  const qs = new URLSearchParams({
    deviceId: d.deviceId || '',
    compartmentId: d.compartmentId || '',
    scheduledAt: d.scheduledAt || '',
  }).toString();

  if (event.action === 'snooze') {
    // Open snooze page which will handle authenticated request
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          if (self.clients.openWindow) {
            return self.clients.openWindow(`/notifications/snooze?${qs}`);
          }
        })
    );
  } else {
    // Default action: open dashboard
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Check if there's already a window open
          for (const client of clientList) {
            if (client.url.includes('/dashboard') && 'focus' in client) {
              return client.focus();
            }
          }
          // If not, open a new window
          if (self.clients.openWindow) {
            return self.clients.openWindow('/dashboard');
          }
        })
    );
  }
});
