// Import Angular's ngsw-worker.js for asset caching
importScripts('./ngsw-worker.js');

// Handle Web Push notifications
self.addEventListener('push', function (event) {
  if (!event.data) return;

  var payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {
      title: 'HCW@Home',
      body: event.data.text(),
    };
  }

  var title = payload.title || 'HCW@Home';
  var options = {
    body: payload.body || '',
    icon: payload.icon || '/assets/icons/icon-192x192.png',
    badge: payload.badge || '/assets/icons/icon-72x72.png',
    data: payload.data || {},
    tag: 'hcw-notification-' + (payload.data && payload.data.message_id ? payload.data.message_id : Date.now()),
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var accessLink = event.notification.data && event.notification.data.access_link;
  if (!accessLink) {
    event.waitUntil(clients.openWindow('/'));
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          client.focus();
          client.navigate(accessLink);
          return;
        }
      }
      return clients.openWindow(accessLink);
    })
  );
});
