/**
 * "Sal D'amato" -> "sal-damato". Must give the same slug as the ingest side (judges.slugify):
 * accents and other non-ASCII characters dropped, apostrophes removed, the rest joined by hyphens.
 */
export function judgeSlug(name: string): string {
  const plain = name
    .normalize("NFD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "");
  return plain.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
