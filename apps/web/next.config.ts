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
};

export default nextConfig;
