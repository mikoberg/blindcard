import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * One static policy for every page. Next.js writes small inline scripts (hydration data), so
 * scripts and styles allow 'unsafe-inline'; nothing is allowed from other origins, and nothing may
 * frame the site. Development also needs 'unsafe-eval' (React's debugging), so the policy is only
 * sent by production builds.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ...(isProduction ? [{ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    // The homepage is the overview of all events now; the old list page folds into it.
    return [{ source: "/events", destination: "/", permanent: true }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // The flags never change under the same name: a day in browsers, a week stale while revalidating.
      {
        source: "/flags/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
