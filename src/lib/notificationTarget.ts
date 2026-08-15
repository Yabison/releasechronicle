import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkConfiguredOutboundUrl } from "@/lib/outboundUrl";

export type TargetRow = { id: string; type: string; label: string; config: unknown };
const toRow = (r: { id: string; type: string; label: string; config: unknown }): TargetRow => ({ id: r.id, type: r.type, label: r.label, config: r.config });

export async function listTargets(): Promise<TargetRow[]> {
  return (await prisma.notificationTarget.findMany({ orderBy: { label: "asc" } })).map(toRow);
}
export async function getTarget(id: string): Promise<TargetRow | null> {
  const r = await prisma.notificationTarget.findUnique({ where: { id } });
  return r ? toRow(r) : null;
}
export async function createTarget(input: { type: string; label: string; config: Record<string, unknown> }): Promise<TargetRow> {
  return toRow(await prisma.notificationTarget.create({ data: { type: input.type, label: input.label, config: input.config as Prisma.InputJsonValue } }));
}
export async function updateTarget(id: string, data: { label?: string; config?: Record<string, unknown> }): Promise<TargetRow> {
  return toRow(await prisma.notificationTarget.update({ where: { id }, data: { ...(data.label !== undefined ? { label: data.label } : {}), ...(data.config !== undefined ? { config: data.config as Prisma.InputJsonValue } : {}) } }));
}
export async function deleteTarget(id: string): Promise<void> {
  await prisma.notificationTarget.delete({ where: { id } });
}

export function validateTargetConfig(type: string, config: unknown): string | null {
  if (!["email", "teams", "webhook"].includes(type)) return "type must be email|teams|webhook";
  const c = (config && typeof config === "object" ? config : {}) as Record<string, unknown>;
  if (type === "email") {
    const to = Array.isArray(c.to) ? c.to.filter((x) => typeof x === "string" && (x as string).trim() !== "") : [];
    if (to.length === 0) return "email target needs at least one recipient";
  } else {
    if (typeof c.url !== "string" || (c.url as string).trim() === "") return `${type} target needs a url`;
    // Reject an unreachable-by-policy url now, rather than logging a failed
    // delivery for every event later.
    const checked = checkConfiguredOutboundUrl((c.url as string).trim());
    if (!checked.ok) return checked.reason;
  }
  return null;
}
