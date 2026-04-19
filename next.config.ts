import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Clean URLs for the two static edufinder pages that live in public/.
  // Next.js serves public/index.html at /index.html by default; these
  // rewrites map the naked paths to those files so:
  //   /          -> public/index.html   (EduFinder 리뷰 페이지)
  //   /challenge -> public/challenge.html  (The Challenge! marketing page)
  // Everything else (/challenge/login, /challenge/dashboard, /challenge/module,
  // /challenge/api/*) is served by the Next.js app router as usual.
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/challenge", destination: "/challenge.html" },
    ];
  },
};

export default nextConfig;
