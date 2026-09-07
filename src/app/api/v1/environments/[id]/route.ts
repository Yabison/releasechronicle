import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { updateEnvironment, softDeleteEnvironment } from "@/lib/environment";
import { nonEmpty, hexColor, ignoredIfInvalid } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const putSchema = z.object({
  name: ignoredIfInvalid(nonEmpty()), // blank/absent/type-mismatched silently ignored, as today
  // A non-string color is silently ignored (old `typeof === "string"` gate), but a string
  // that fails the hex format must still 400 - hence the preprocess instead of a bare `.optional()`.
  color: z.preprocess((v) => (typeof v === "string" ? v : undefined), hexColor.optional()),
  sortOrder: ignoredIfInvalid(z.number().int()),
  public: ignoredIfInvalid(z.boolean()),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.res;
  const data: { name?: string; color?: string; sortOrder?: number; public?: boolean } = {};
  if (parsed.value.name !== undefined) data.name = parsed.value.name;
  if (parsed.value.color !== undefined) data.color = parsed.value.color;
  if (parsed.value.sortOrder !== undefined) data.sortOrder = parsed.value.sortOrder;
  if (parsed.value.public !== undefined) data.public = parsed.value.public;
  const updated = await updateEnvironment(id, data).catch(() => null);
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(updated, { status: 200 });
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  await softDeleteEnvironment(id).catch(() => null);
  return Response.json({ ok: true }, { status: 200 });
}
