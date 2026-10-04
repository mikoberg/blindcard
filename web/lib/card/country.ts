/** Lower-case ISO 3166-1 alpha-2 code, or one of the home nations (gb-eng, gb-sct, gb-wls, gb-nir). */
const COUNTRY_CODE = /^[a-z]{2}(-[a-z]{3})?$/;

/** A code that is safe to put in an image path, or null. */
export function flagCode(value: string | null | undefined): string | null {
  return typeof value === "string" && COUNTRY_CODE.test(value) ? value : null;
}
