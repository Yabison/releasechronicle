/**
 * Substitute {version} in a product's build-URL template. Returns null when the
 * template or version is missing/blank. A template without {version} is returned
 * unchanged (still a valid link).
 */
export function buildUrl(
  template: string | null | undefined,
  version: string | null | undefined,
): string | null {
  if (!template || template.trim() === "") return null;
  if (!version || version.trim() === "") return null;
  return template.replaceAll("{version}", version);
}
