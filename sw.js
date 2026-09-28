var CACHE_NAME = 'ts-jobs-v1';
var APP_SHELL = ['./index.html', './manifest.json'];
var FEED_CACHE = 'ts-jobs-feeds';

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) {
        return k !== CACHE_NAME && k !== FEED_CACHE;
      }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  if (url.includes('allorigins.win') || url.includes('trabajando.com') || url.includes('computrabajo.com')) {
    e.respondWith(
      fetch(e.request).then(function(resp) {
        var clone = resp.clone();
        caches.open(FEED_CACHE).then(function(cache) { cache.put(e.request, clone); });
        return resp;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
    })
  );
});
