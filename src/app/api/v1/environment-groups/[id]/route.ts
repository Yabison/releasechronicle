import { requireAdmin } from "@/lib/auth/guard";
import { updateEnvironmentGroup, softDeleteEnvironmentGroup, getActiveEnvSlugs } from "@/lib/environment";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: { name?: string; members?: string[]; sortOrder?: number } = {};
  if (body && typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body && Array.isArray(body.members)) {
    const members = body.members.filter((m: unknown) => typeof m === "string");
    const valid = await getActiveEnvSlugs();
    if (members.length === 0 || !members.every((m: string) => valid.includes(m))) {
      return Response.json({ error: "members must be a non-empty list of valid environment slugs" }, { status: 400 });
    }
    data.members = members;
  }
  if (body && Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
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
