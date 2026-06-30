const CACHE_NAME = 'mccree-app-v3'; // Новая версия
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/api.js',
    '/app.js',
    '/reader.js'
];

// ОПТИМИЗАЦИЯ: Предварительное кэширование
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Кэширование ресурсов...');
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => {
            console.log('[SW] Ресурсы закэшированы');
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME && !key.startsWith('manga-images-')) {
                        console.log('[SW] Удаление старого кэша:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ОПТИМИЗАЦИЯ: Улучшенная стратегия с приоритетом скорости
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Игнорируем Supabase
    if (url.href.includes('supabase.co')) {
        return;
    }

    // СТРАТЕГИЯ ДЛЯ ИЗОБРАЖЕНИЙ: Cache First с обновлением в фоне
    if (event.request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
        event.respondWith(
            caches.open('manga-images-cache').then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        // ОПТИМИЗАЦИЯ: Обновляем кэш в фоне
                        fetch(event.request).then((networkResponse) => {
                            if (networkResponse.status === 200) {
                                cache.put(event.request, networkResponse.clone());
                            }
                        }).catch(() => {});
                        return cachedResponse;
                    }

                    return fetch(event.request).then((networkResponse) => {
                        if (networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => {
                        // ОПТИМИЗАЦИЯ: Плейсхолдер для офлайн-режима
                        return new Response('Изображение недоступно', { status: 404 });
                    });
                });
            })
        );
        return;
    }

    // СТРАТЕГИЯ ДЛЯ КОДА: Stale-While-Revalidate (быстрее, чем Network First)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return networkResponse;
            }).catch(() => {});

            // ОПТИМИЗАЦИЯ: Возвращаем кэш сразу, обновляем в фоне
            if (cachedResponse) {
                // Не ждем ответ от сети
                fetchPromise.catch(() => {});
                return cachedResponse;
            }
            
            return fetchPromise;
        })
    );
});