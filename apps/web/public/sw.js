// Inkwell Service Worker — asset caching + offline fallback + push notifications
// Bump CACHE_NAME when SW logic changes to force re-activation in browsers
// that still have an older SW running.
const CACHE_NAME = "inkwell-v3";
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [OFFLINE_URL, "/favicon.svg", "/inkwell-logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Allow the page to tell a waiting SW to activate now (used by sw-register.tsx
// to avoid waiting for all tabs to close before a new SW takes over).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch requests we can't/shouldn't cache:
  //  - non-GET
  //  - non-http(s) schemes (chrome-extension://, blob:, data:, etc.)
  //    Cache.put() throws TypeError on these — they surface as loud console
  //    errors from browser extensions that inject fetches into the page.
  //  - API requests, auth flows, RSC data
  if (
    request.method !== "GET" ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/_next/data/")
  ) {
    return;
  }

  // Cache-first for static assets
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/stamps/") ||
    url.pathname.startsWith("/frames/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Network-first for navigation, offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }
});

// --- Push Notifications ---

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Inkwell", body: event.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.svg",
    badge: payload.badge || "/favicon.svg",
    tag: payload.tag || "inkwell-notification",
    data: payload.data || {},
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title || "Inkwell", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing Inkwell tab if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    })
  );
});
