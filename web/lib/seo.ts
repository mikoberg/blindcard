import type { Metadata } from "next";

export const SITE_NAME = "Blindcard";

// The one share image (app/opengraph-image.tsx). A page that sets its own openGraph or twitter
// object does not inherit the layout's file-based image, so every page names it itself.
const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Blindcard: which fights are worth watching, with no spoilers",
} as const;

interface PageMeta {
  /** The page's own title, without the site name. */
  title: string;
  /** One or two plain sentences. Never a result: only what is public before a Reveal. */
  description: string;
  /** The page's path, for the canonical link and og:url (resolved against metadataBase). */
  path: string;
  /**
   * True for pages directly under the root layout: a title template does not apply to the segment
   * of its own layout, so these carry the full "Blindcard – title" themselves.
   */
  root?: boolean;
  /** Keep the page out of search results (links still work). */
  noindex?: boolean;
}

/**
 * Title, description, canonical, Open Graph and Twitter tags of a page, all from the same four
 * facts, so no page ends up with a half-set tag list. Open Graph is replaced as a whole by a page
 * that sets any of it, which is why the site name and type are repeated here.
 */
export function pageMetadata({ title, description, path, root = false, noindex = false }: PageMeta): Metadata {
  const full = `${SITE_NAME} – ${title}`;
  return {
    title: root ? { absolute: full } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en",
      title: full,
      description,
      url: path,
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title: full, description, images: [SHARE_IMAGE.url] },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * JSON-LD for a script tag. `<` is escaped so no text in the data can close the tag early.
 */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
