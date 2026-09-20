// Inkwell Service Worker — push notifications only.
//
// This worker deliberately has NO `fetch` handler.
//
// It used to intercept navigations (network-first with an /offline fallback)
// and static assets (cache-first). Serving the page through the worker made
// React's hydration of the streamed document fail on EVERY page load, in
// production, signed in or out — "Minified React error #418" — so React threw
// away the entire server-rendered document and re-rendered it on the client.
//
// Measured on production 2026-09-20, same HTML bytes and same bundles in both
// cases, in fresh tabs:
//   navigation served by the worker (workerStart 1.9ms, controller true)
//     → React error #418, and afterwards <head>/<body> children are in
//       React's client-render order with the server's nodes left stranded
//       in front of them (duplicated JSON-LD, charset <meta> at index 18).
//   navigation NOT served by the worker (workerStart 0)
//     → clean console, server HTML adopted as-is.
// Proxying the identical production HTML and bundles from localhost (so the
// page is uncontrolled) never reproduced it, which is why this was invisible
// in dev and in a local production build.
//
// A worker with no fetch handler is skipped entirely for navigations and
// subresources, which is exactly the clean case above. The caching it did was
// near-worthless anyway: /_next/static/* is already immutable-cached by the
// browser, and caching unversioned paths cache-first by URL is what stopped
// redrawn /frames/*.svg from ever reaching returning visitors. If offline
// support comes back, it must be re-verified against hydration first.

self.addEventListener("install", () => {
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
  // Drop every cache the old asset-caching worker left behind, so returning
  // visitors stop being served stale copies of unversioned files.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
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
