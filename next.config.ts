import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serves public/index.html at the naked / path.
  // (The /challenge route is handled by src/app/challenge/route.ts instead
  // of a rewrite, because the src/app/challenge/ folder intercepts /challenge
  // before rewrites can fire.)
  async redirects() {
    return [
      { source: "/prediction.html", destination: "/prediction", permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/prediction", destination: "/prediction.html" },
    ];
  },
};

export default nextConfig;
