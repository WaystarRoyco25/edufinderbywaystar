import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serves public/index.html at the naked / path.
  // (The /challenge route is handled by src/app/challenge/route.ts instead
  // of a rewrite, because the src/app/challenge/ folder intercepts /challenge
  // before rewrites can fire.)
  async redirects() {
    return [
      { source: "/prediction.html", destination: "/prediction", permanent: true },
      { source: "/genius.html", destination: "/genius", permanent: true },
      { source: "/who-we-are.html", destination: "/who-we-are", permanent: true },
      { source: "/announcements.html", destination: "/announcements", permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/prediction", destination: "/prediction.html" },
      { source: "/genius", destination: "/genius.html" },
      { source: "/who-we-are", destination: "/who-we-are.html" },
      { source: "/announcements", destination: "/announcements.html" },
    ];
  },
};

export default nextConfig;
