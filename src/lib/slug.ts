export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Returns a slug derived from `name` that is not already taken.
 * `exists` reports whether a candidate slug is already in use.
 */
export async function uniqueSlug(
  name: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name);
  if (!(await exists(base))) return base;
  let n = 2;
  while (await exists(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
