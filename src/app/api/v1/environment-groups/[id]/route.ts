import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { updateEnvironmentGroup, softDeleteEnvironmentGroup, getActiveEnvSlugs } from "@/lib/environment";
import { nonEmpty, ignoredIfInvalid } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const putSchema = z.object({
  name: ignoredIfInvalid(nonEmpty()),
  members: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((m) => typeof m === "string") : undefined),
    z.array(z.string()).optional(),
  ),
  sortOrder: ignoredIfInvalid(z.number().int()),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.res;
  const data: { name?: string; members?: string[]; sortOrder?: number } = {};
  if (parsed.value.name !== undefined) data.name = parsed.value.name;
  if (parsed.value.members !== undefined) {
    const valid = await getActiveEnvSlugs();
    if (parsed.value.members.length === 0 || !parsed.value.members.every((m) => valid.includes(m))) {
      return Response.json({ error: "members must be a non-empty list of valid environment slugs" }, { status: 400 });
    }
    data.members = parsed.value.members;
  }
  if (parsed.value.sortOrder !== undefined) data.sortOrder = parsed.value.sortOrder;
  const updated = await updateEnvironmentGroup(id, data).catch(() => null);
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(updated, { status: 200 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  await softDeleteEnvironmentGroup(id).catch(() => null);
  return Response.json({ ok: true }, { status: 200 });
}
