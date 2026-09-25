import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inkwell",
    short_name: "Inkwell",
    description:
      "A federated social journaling platform. Your journal, your friends, your space.",
    id: "/?source=pwa",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "any",
    // Opening a notification or a shortcut reuses the open Inkwell window.
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    lang: "en",
    prefer_related_applications: false,
    categories: ["social", "lifestyle"],
    // "Share → Inkwell" from other apps (Android, and Chrome on desktop;
    // iOS doesn't support share targets for web apps).
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    // Long-press the home-screen icon (Android) or right-click the dock icon.
    shortcuts: [
      { name: "Write an entry", short_name: "Write", url: "/editor?source=shortcut", icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }] },
      { name: "Notifications", short_name: "Alerts", url: "/notifications?source=shortcut", icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }] },
      { name: "Letters", url: "/letters?source=shortcut", icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }] },
      { name: "Explore", url: "/explore?source=shortcut", icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }] },
    ],
    icons: [
      { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png" },
      { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
      { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png" },
      { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png" },
      { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-384x384.png",
        sizes: "384x384",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
