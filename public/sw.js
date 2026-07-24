self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
    const data = e.data.json();
    e.waitUntil(self.registration.showNotification(data.title || 'Papalegua', {
        body: data.body || 'Nova mensagem',
        icon: data.icon || '/uploads/avatars/default.png',
        badge: '/favicon.ico',
        vibrate: [200, 100, 200],
        data: { url: data.url || '/contacts.html' },
        actions: [{ action: 'open', title: 'Abrir' }]
    }));
});
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(clients.openWindow(e.notification.data.url || '/contacts.html'));
});
