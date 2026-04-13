"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      // updateViaCache: "none" tells the browser to never use its HTTP cache
      // when fetching /sw.js — so a newly deployed SW is picked up on the next
      // navigation, not up to 24 hours later. Without this, stale service
      // workers (with old bugs) can linger in user browsers long after we fix
      // them in prod.
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          // Force an update check every time the app mounts. If the sw.js
          // bytes have changed, the browser installs the new version and
          // our in-SW `skipWaiting()` + `clients.claim()` makes it active
          // immediately rather than after a full page close.
          registration.update().catch(() => {});

          // If there's already a waiting SW (new version installed, old
          // still active), tell it to take over right now.
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }

          // Watch for newly installed SWs while this tab is open.
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                // A new SW has installed and is waiting. Activate it.
                installing.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => {
          // Registration failures are non-fatal — the app works without SW.
        });
    }
  }, []);

  return null;
}
