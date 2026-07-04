self.addEventListener('push', function(event) {
  var payload = {
    title: 'Новое уведомление',
    body: 'Проверьте сайт',
    url: '/'
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (error) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      badge: '/static/images/1.png',
      icon: '/static/images/1.png',
      data: {
        url: payload.url || '/'
      }
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var targetUrl = '/';
  if (event.notification && event.notification.data && event.notification.data.url) {
    targetUrl = event.notification.data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i += 1) {
        var client = clientList[i];
        if (client.url.indexOf(targetUrl) !== -1 && 'focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
