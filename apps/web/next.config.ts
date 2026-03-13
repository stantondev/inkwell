import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a standalone build for Docker deployments
  // (copies only the files needed to run into .next/standalone)
  output: "standalone",

  // Allow larger request bodies for avatar uploads (5MB)
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },

  // Prevent browsers from caching the service worker file
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
