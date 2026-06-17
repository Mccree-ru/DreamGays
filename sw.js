const CACHE_NAME = 'mccree-v1';
const ASSETS = []; // Можно добавить сюда статические файлы (css, js)

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener('fetch', (event) => {
    // Кэшируем только изображения
    if (event.request.destination === 'image') {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                    return response;
                });
            })
        );
    }
});
