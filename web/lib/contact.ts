/** Where to send corrections and takedown requests when no contact address is configured. */
export const ISSUES_URL = "https://github.com/mikoberg/blindcard/issues";

/**
 * The public contact address, set per deployment in NEXT_PUBLIC_CONTACT_EMAIL. There is no default
 * on purpose: an address that was never chosen for this site must not appear on it. Anything that is
 * not a plain address is ignored (it ends up in a mailto: link).
 */
export function getContactEmail(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  if (!value) return null;
  return /^[^\s@<>"',;:()\\]+@[^\s@<>"',;:()\\]+\.[^\s@<>"',;:()\\]+$/.test(value) ? value : null;
}
