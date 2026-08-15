import { requireAdmin } from "@/lib/auth/guard";
import { updateEnvironment, softDeleteEnvironment } from "@/lib/environment";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: { name?: string; color?: string; sortOrder?: number; public?: boolean } = {};
  if (body && typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body && typeof body.color === "string") {
    if (!/^#[0-9a-f]{6}$/i.test(body.color.trim())) return Response.json({ error: "color must be #rrggbb" }, { status: 400 });
    data.color = body.color.trim();
  }
  if (body && Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
  if (typeof body?.public === "boolean") data.public = body.public;
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
