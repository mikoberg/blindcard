const DEV_FALLBACK = "http://localhost:3000";

function parseHttpUrl(value: string, source: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `${source} must be an absolute http(s) URL such as https://example.com (got "${value}"). See web/README.md.`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${source} must use http: or https: (got "${url.protocol}"). See web/README.md.`);
  }
  return url;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * The public base URL of the site (canonical links, Open Graph, sitemap, robots), without a
 * trailing slash. An explicit NEXT_PUBLIC_SITE_URL always wins. Production never falls back to
 * localhost: it uses Vercel's VERCEL_PROJECT_PRODUCTION_URL or fails loudly.
 */
export function getSiteUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    parseHttpUrl(explicit, "NEXT_PUBLIC_SITE_URL");
    return stripTrailingSlashes(explicit);
  }

  if (env.NODE_ENV !== "production") return DEV_FALLBACK;

  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) {
    const candidate = /^https:\/\//i.test(vercel) ? vercel : `https://${vercel}`;
    parseHttpUrl(candidate, "VERCEL_PROJECT_PRODUCTION_URL");
    return stripTrailingSlashes(candidate);
  }

  throw new Error(
    "NEXT_PUBLIC_SITE_URL must be set for production builds (an absolute URL such as " +
      "https://blindcard.example). See the Deploy section in web/README.md.",
  );
}
