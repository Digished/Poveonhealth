/*
 * Poveon service worker.
 *
 * Deliberately minimal. Health data must never be served stale or to the wrong
 * person, so nothing under /api is cached and no page HTML is stored either —
 * the cache holds only build assets and an offline fallback. What it buys is an
 * app that opens instantly from the home screen and says something useful when
 * the phone has no signal.
 */
const VERSION = "poveon-v1";
const OFFLINE_URL = "/offline";
const SHELL = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];
// Bump VERSION whenever SHELL changes so old caches are dropped on activate.

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Someone's results are not a static asset.
  if (url.pathname.startsWith("/api/")) return;

  // Pages always come from the network; offline they get the fallback. Nothing
  // page-shaped is written to the cache, so a shared phone can't replay another
  // person's screen.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Build assets are content-hashed, so a cache hit is always correct.
  const cacheable =
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|svg|ico|webp|jpg|jpeg|woff2?)$/.test(url.pathname);
  if (!cacheable) return;

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
    )
  );
});
