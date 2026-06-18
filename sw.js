const CACHE_NAME = 'mccree-app-v2'; // Меняй версию (v2 -> v3), когда кардинально меняешь дизайн
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/api.js',
    '/app.js',
    '/reader.js'
];

// Установка воркера и кэширование скелета приложения
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Активация и автоматическое удаление старых кэшей кода приложения
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME && !key.startsWith('manga-images-')) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Умный перехват запросов
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Игнорируем запросы к серверу Supabase (их кэшировать нельзя, там живые комменты и лайки!)
    if (url.href.includes('supabase.co')) {
        return;
    }

    // СТРАТЕГИЯ ДЛЯ ИЗОБРАЖЕНИЙ (Страницы маньхуа и обложки): Cache First
    if (event.request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
        event.respondWith(
            caches.open('manga-images-cache').then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    // Если картинка есть в кэше — отдаем мгновенно
                    if (cachedResponse) return cachedResponse;

                    // Если нет — качаем из сети, сохраняем в кэш картинок и отдаем
                    return fetch(event.request).then((networkResponse) => {
                        if (networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => Response.error());
                });
            })
        );
        return;
    }

    // СТРАТЕГИЯ ДЛЯ КОДА (HTML, JS, CSS): Network First (Сначала сеть для мгновенных апдейтов)
    event.respondWith(
        fetch(event.request).then((networkResponse) => {
            // Если сеть есть, обновляем кэш скриптов на лету
            if (networkResponse.status === 200) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            }
            return networkResponse;
        }).catch(() => {
            // Если сети нет (оффлайн), достаем скрипты из кэша
            return caches.match(event.request);
        })
    );
});