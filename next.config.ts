import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@electric-sql/pglite"],

  // Route '/' through an independent landing page. This avoids the
  // production 404 observed on some existing Windows Next installations,
  // while preserving the homepage URL and its 'home' storefront view.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/home" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
