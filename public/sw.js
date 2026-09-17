/* GiBiScore service worker: shows the push notifications of the favourite
   competitions and teams, and opens the match on tap. Nothing is cached
   here: the pages keep coming from the network. */

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {title: 'GiBiScore', body: event.data ? event.data.text() : ''};
    }
    const title = data.title || 'GiBiScore';
    const options = {
        body: data.body || '',
        icon: '/brand/png/gibiscore-icon-192.png',
        badge: '/brand/png/gibiscore-favicon-accent-192.png',
        tag: data.tag || 'gibiscore',
        renotify: true,
        data: {url: data.url || '/'},
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({type: 'window', includeUncontrolled: true}).then((list) => {
            for (const client of list) {
                if (client.url === url && 'focus' in client) return client.focus();
            }
            return self.clients.openWindow(url);
        }),
    );
});
