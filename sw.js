const CACHE_NAME = 'fishies-v1';
const PRECACHE_URLS = [
    '/',
    'style.css',
    'manifest.json',
    'favicon.png',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'js/main.js',
    'js/fish.js',
    'js/ui.js',
    'js/tank.js',
    'js/store.js',
    'js/orientation.js',
    'js/effects.js',
    'js/decorations.js',
    'js/food.js',
    'js/save.js',
    'js/utils.js',
    'js/audio.js',
    'js/shadowfish.js'
];

// Install: precache app shell
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
    );
});

// Activate: clean old caches, claim clients
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: stale-while-revalidate
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            const fetchPromise = fetch(e.request).then(response => {
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => cached);

            return cached || fetchPromise;
        })
    );
});

// Message: allow update banner to trigger skipWaiting
self.addEventListener('message', e => {
    if (e.data && e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
