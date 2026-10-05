const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slugs are lowercase words joined by single hyphens. Anything else never reaches the database. */
export function isValidSlug(slug: string): boolean {
  return slug.length >= 1 && slug.length <= 200 && SLUG_PATTERN.test(slug);
}
