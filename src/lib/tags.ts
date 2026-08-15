import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";

/** A tag as seen in the admin: its name, config colour (if any) and how many events use it. */
export type TagInfo = { name: string; slug: string; color: string | null; count: number };

/** Every tag: those used on events (any) unioned with configured tags (with colours). */
export async function listAllTags(): Promise<TagInfo[]> {
  const configs = await prisma.tagConfig.findMany();
  const bySlug = new Map(configs.map((c) => [c.slug, c]));
  const usage = await prisma.$queryRaw<{ tag: string; count: number }[]>`
    SELECT unnest(tags) AS tag, count(*)::int AS count FROM "Event" WHERE "deletedAt" IS NULL GROUP BY tag`;
  const counts = new Map(usage.map((u) => [u.tag, u.count]));
  const names = new Set<string>([...counts.keys(), ...configs.map((c) => c.name)].filter((n) => n.trim() !== ""));
  const out: TagInfo[] = [];
  for (const name of names) {
    const cfg = bySlug.get(slugify(name)) ?? null;
    out.push({ name, slug: cfg?.slug ?? slugify(name), color: cfg?.color ?? null, count: counts.get(name) ?? 0 });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Set (create or update) the colour of a tag, keyed by its slug. */
export async function setTagColor(name: string, color: string): Promise<void> {
  const slug = slugify(name);
  await prisma.tagConfig.upsert({
    where: { slug },
    create: { slug, name, color, sortOrder: 0 },
    update: { color, name },
  });
}

/** Rename a tag everywhere: across all events + its config (if any). */
export async function renameTag(oldName: string, newName: string): Promise<void> {
  const nn = newName.trim();
  if (!nn || nn === oldName) return;
  await prisma.$executeRaw`UPDATE "Event" SET tags = array_replace(tags, ${oldName}, ${nn}) WHERE ${oldName} = ANY(tags)`;
  const oldSlug = slugify(oldName), newSlug = slugify(nn);
  const cfg = await prisma.tagConfig.findUnique({ where: { slug: oldSlug } });
  if (cfg) {
    // Free the target slug first so the rename can't hit the unique constraint.
    if (newSlug !== oldSlug) await prisma.tagConfig.deleteMany({ where: { slug: newSlug } });
    await prisma.tagConfig.update({ where: { id: cfg.id }, data: { name: nn, slug: newSlug } });
  }
}

/** Remove a tag everywhere: from all events + its config. */
export async function deleteTagEverywhere(name: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "Event" SET tags = array_remove(tags, ${name}) WHERE ${name} = ANY(tags)`;
  await prisma.tagConfig.deleteMany({ where: { slug: slugify(name) } });
}
