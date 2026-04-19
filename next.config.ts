import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Clean URLs for the two static edufinder pages that live in public/.
  // Next.js serves public/index.html at /index.html by default; these
  // rewrites map the naked paths to those files so:
  //   /          -> public/index.html   (EduFinder 리뷰 페이지)
  //   /challenge -> public/challenge.html  (The Challenge! marketing page)
  // Everything else (/challenge/login, /challenge/dashboard, /challenge/module,
  // /challenge/api/*) is served by the Next.js app router as usual.
  //
  // beforeFiles is used so these rewrites fire BEFORE Next.js checks the
  // app/ directory. Without this, the existence of the src/app/challenge/
  // folder (which holds the login/dashboard/module sub-routes) intercepts
  // /challenge and returns a 404 instead of serving challenge.html.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        { source: "/challenge", destination: "/challenge.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
