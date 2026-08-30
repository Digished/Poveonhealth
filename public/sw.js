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

/*
 * Push notifications.
 *
 * The payload is written by lib/push.ts. A malformed or empty one still shows
 * something rather than nothing — a silent failure here looks to the user like
 * the app simply not working.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text ? event.data.text() : "" };
  }

  const title = data.title || "Poveon";
  const options = {
    body: data.body || "You have a new message.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Same tag replaces rather than stacks, so ten messages from one member do
    // not become ten notifications.
    tag: data.tag || "poveon",
    renotify: true,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  // Focus an open tab if there is one rather than opening a second copy of the
  // app — tapping a notification should feel like returning to it.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
