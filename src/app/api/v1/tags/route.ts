import { requireAdmin } from "@/lib/auth/guard";
import { listAllTags, setTagColor, renameTag, deleteTagEverywhere } from "@/lib/tags";

/** All tags (event-used ∪ configured) with their colour and usage count. Public (for chip colours). */
export async function GET() {
  return Response.json(await listAllTags());
}

/** Set a tag's colour. */
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const name = body && typeof body.name === "string" ? body.name.trim() : "";
  const color = body && typeof body.color === "string" ? body.color.trim() : "";
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  if (!/^#[0-9a-f]{6}$/i.test(color)) return Response.json({ error: "color must be #rrggbb" }, { status: 400 });
  await setTagColor(name, color);
  return Response.json({ ok: true }, { status: 200 });
}

/** Rename a tag (newName) and/or set its colour, keyed by name. */
export async function PUT(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const name = body && typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  const newName = typeof body?.newName === "string" ? body.newName.trim() : "";
  let current = name;
  if (newName && newName !== name) { await renameTag(name, newName); current = newName; }
  if (typeof body?.color === "string") {
    if (!/^#[0-9a-f]{6}$/i.test(body.color.trim())) return Response.json({ error: "color must be #rrggbb" }, { status: 400 });
    await setTagColor(current, body.color.trim());
  }
  return Response.json({ ok: true, name: current }, { status: 200 });
}

/** Delete a tag everywhere; name in body or ?name=. */
export async function DELETE(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const name = (body && typeof body.name === "string" ? body.name : new URL(req.url).searchParams.get("name") ?? "").trim();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  await deleteTagEverywhere(name);
  return Response.json({ ok: true }, { status: 200 });
}
