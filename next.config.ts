import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Development-only: allow a phone on the local network to load Next.js dev
  // resources from the desktop dev server.
  allowedDevOrigins: ["192.168.50.16"],
};

export default nextConfig;
