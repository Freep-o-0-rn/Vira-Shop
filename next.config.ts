import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  serverExternalPackages: ["@electric-sql/pglite"],
  allowedDevOrigins: ["v54.shop"],
};

export default nextConfig;
