import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a standalone build for Docker deployments
  // (copies only the files needed to run into .next/standalone)
  output: "standalone",
};

export default nextConfig;
