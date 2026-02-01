// === Shadow Boxing Web App - Service Worker ===
const CACHE_NAME = 'shadowboxing-v1.0';
const AUDIO_CACHE_NAME = 'shadowboxing-audio-v1.0';

// App shell files to cache
const APP_SHELL = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './icon-512.png'
];

// Audio files to cache
const AUDIO_FILES = [
    // System sounds
    'get_ready.mp3', 'round_start.mp3', 'rest.mp3', 'workout_complete.mp3',
    'last_10_seconds.mp3', 'time_reset.mp3', 'pause.mp3', 'resume.mp3',
    // Bell & effects
    'bell_start.mp3', 'bell_end.mp3', 'beep.mp3', 'victory.mp3',
    // Countdown
    '1.mp3', '2.mp3', '3.mp3', '4.mp3', '5.mp3', '6.mp3',
    '7.mp3', '8.mp3', '9.mp3', '10.mp3',
    // Punches
    'jab.mp3', 'cross.mp3', 'lead_hook.mp3', 'rear_hook.mp3',
    'lead_uppercut.mp3', 'rear_uppercut.mp3',
    // Defense
    'slip.mp3', 'roll.mp3', 'pivot.mp3', 'duck.mp3', 'block.mp3',
    // Breathing
    'inhale.mp3', 'exhale.mp3', 'hold.mp3', 'breathe_complete.mp3',
    // Round announcements
    'round_1.mp3', 'round_2.mp3', 'round_3.mp3', 'round_4.mp3',
    'round_5.mp3', 'round_6.mp3', 'round_7.mp3', 'round_8.mp3',
    'round_9.mp3', 'round_10.mp3', 'round_11.mp3', 'round_12.mp3'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching app shell');
                return cache.addAll(APP_SHELL);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== AUDIO_CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Handle audio files separately
    if (url.pathname.endsWith('.mp3')) {
        event.respondWith(
            caches.open(AUDIO_CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((response) => {
                    if (response) {
                        return response;
                    }
                    return fetch(event.request).then((networkResponse) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // Handle other requests
    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                return response;
            }
            return fetch(event.request);
        })
    );
});

// Message handler for audio caching
self.addEventListener('message', async (event) => {
    if (event.data.action === 'cacheAudio') {
        console.log('[SW] Caching audio files...');
        try {
            const cache = await caches.open(AUDIO_CACHE_NAME);
            const audioUrls = AUDIO_FILES.map(file => `./${file}`);

            // Cache files one by one to avoid total failure if one is missing
            const results = await Promise.allSettled(
                audioUrls.map(url => cache.add(url))
            );

            const failed = results.filter(r => r.status === 'rejected');
            if (failed.length > 0) {
                console.warn(`[SW] Some audio files failed to cache:`, failed);
            }

            event.ports[0].postMessage({
                success: true,
                partial: failed.length > 0,
                failedCount: failed.length
            });
        } catch (error) {
            console.error('[SW] Audio cache failed:', error);
            event.ports[0].postMessage({ success: false, error: error.message });
        }
    }

    if (event.data.action === 'getAudioCacheStatus') {
        caches.open(AUDIO_CACHE_NAME).then((cache) => {
            return cache.keys();
        }).then((keys) => {
            const cachedCount = keys.filter(req => req.url.endsWith('.mp3')).length;
            event.ports[0].postMessage({
                cached: cachedCount,
                total: AUDIO_FILES.length,
                complete: cachedCount >= AUDIO_FILES.length
            });
        });
    }
});
