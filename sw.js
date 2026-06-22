/* ИИ-практикум — service worker (офлайн-кэш для GitHub Pages) */
const CACHE = "ai-course-v39";

/* Базовые файлы курса. Пути относительные — работают и на github.io/<repo>/.
   URL с ?v=39 совпадают с тем, что запрашивает index.html (кэш по точному URL). */
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=39",
  "./features.css?v=39",
  "./script.js?v=39",
  "./features.js?v=39",
  "./manifest.webmanifest",
  "./admin.html",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(CORE.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // не кэшируем отправку результатов (POST)

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Никогда не кэшируем Apps Script (динамика: вход, отправка, статистика)
  if (url.hostname.endsWith("script.google.com") || url.hostname.endsWith("googleusercontent.com")) {
    return;
  }

  // Навигация: сеть → офлайн-фолбэк на index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(CACHE).then((c) => c.match("./index.html"))
      )
    );
    return;
  }

  if (sameOrigin) {
    // Статика курса: stale-while-revalidate по точным URL.
    // Не игнорируем query string, чтобы кэш разных сборок не смешивался.
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((resp) => {
          if (resp && resp.status === 200) cache.put(request, resp.clone());
          return resp;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Шрифты Google и прочая статика: cache-first
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const resp = await fetch(request);
        if (resp && (resp.status === 200 || resp.type === "opaque")) cache.put(request, resp.clone());
        return resp;
      } catch {
        return cached || Response.error();
      }
    })
  );
});
