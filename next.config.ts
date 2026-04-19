import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serves public/index.html at the naked / path.
  // (The /challenge route is handled by src/app/challenge/route.ts instead
  // of a rewrite, because the src/app/challenge/ folder intercepts /challenge
  // before rewrites can fire.)
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
    ];
  },
};

export default nextConfig;
