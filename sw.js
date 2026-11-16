const FILES = ['./', 'index.html', 'style.css', 'data.js', 'app.js', 'img/placeholder.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open('poshagovo').then(cache => cache.addAll(FILES)));
});

self.addEventListener('fetch', e => {
  if (e.request.method != 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open('poshagovo').then(cache => cache.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});