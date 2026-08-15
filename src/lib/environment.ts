import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";

export type EnvRow = { id: string; slug: string; name: string; color: string; sortOrder: number; public: boolean };
export const DEFAULT_ENV_COLOR = "#64748b";

const active = { deletedAt: null };

export async function listEnvironments(): Promise<EnvRow[]> {
  const rows = await prisma.environmentConfig.findMany({ where: active, orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, color: r.color, sortOrder: r.sortOrder, public: r.public }));
}
export async function getActiveEnvSlugs(): Promise<string[]> {
  return (await prisma.environmentConfig.findMany({ where: active, select: { slug: true } })).map((r) => r.slug);
}
export async function resolveEnvColorMap(): Promise<Record<string, string>> {
  const rows = await prisma.environmentConfig.findMany({ where: active, select: { slug: true, color: true } });
  return Object.fromEntries(rows.map((r) => [r.slug, r.color]));
}
export async function createEnvironment(input: { name: string; color: string }): Promise<EnvRow> {
  const slug = slugify(input.name);
  const max = await prisma.environmentConfig.aggregate({ _max: { sortOrder: true } });
  const r = await prisma.environmentConfig.create({
    data: { slug, name: input.name, color: input.color, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  return { id: r.id, slug: r.slug, name: r.name, color: r.color, sortOrder: r.sortOrder, public: r.public };
}

/** Slugs of environments flagged public (for anonymous filtering). */
export async function getPublicEnvSlugs(): Promise<string[]> {
  return (await prisma.environmentConfig.findMany({ where: { ...active, public: true }, select: { slug: true } })).map((r) => r.slug);
}
export async function updateEnvironment(id: string, data: { name?: string; color?: string; sortOrder?: number; public?: boolean }): Promise<EnvRow> {
  const r = await prisma.environmentConfig.update({ where: { id }, data });
  return { id: r.id, slug: r.slug, name: r.name, color: r.color, sortOrder: r.sortOrder, public: r.public };
}
export async function softDeleteEnvironment(id: string): Promise<void> {
  await prisma.environmentConfig.update({ where: { id }, data: { deletedAt: new Date() } });
}

// --- Environment groups: a named set of env slugs (e.g. ALLPROD = run+secure+prod) ---

export type EnvGroupRow = { id: string; slug: string; name: string; members: string[]; sortOrder: number };

export async function listEnvironmentGroups(): Promise<EnvGroupRow[]> {
  const rows = await prisma.environmentGroup.findMany({ where: active, orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, members: r.members, sortOrder: r.sortOrder }));
}

export async function createEnvironmentGroup(input: { name: string; members: string[] }): Promise<EnvGroupRow> {
  const slug = slugify(input.name);
  const max = await prisma.environmentGroup.aggregate({ _max: { sortOrder: true } });
  const r = await prisma.environmentGroup.create({
    data: { slug, name: input.name, members: input.members, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  return { id: r.id, slug: r.slug, name: r.name, members: r.members, sortOrder: r.sortOrder };
}

export async function updateEnvironmentGroup(id: string, data: { name?: string; members?: string[]; sortOrder?: number }): Promise<EnvGroupRow> {
  const r = await prisma.environmentGroup.update({ where: { id }, data });
  return { id: r.id, slug: r.slug, name: r.name, members: r.members, sortOrder: r.sortOrder };
}

export async function softDeleteEnvironmentGroup(id: string): Promise<void> {
  await prisma.environmentGroup.update({ where: { id }, data: { deletedAt: new Date() } });
}
