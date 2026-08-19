// Self-unregistering service worker — clears all cached assets from previous versions
// This runs once to clean up legacy SW caches, then unregisters itself

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
            const allClients = await self.clients.matchAll();
            allClients.forEach(client => client.navigate(client.url));
            await self.registration.unregister();
        })()
    );
});

