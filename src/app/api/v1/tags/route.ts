import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { listAllTags, setTagColor, renameTag, deleteTagEverywhere } from "@/lib/tags";
import { nonEmpty, optionalStr, hexColor, ignoredIfInvalid } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

/** All tags (event-used ∪ configured) with their colour and usage count. Public (for chip colours). */
export async function GET() {
  return Response.json(await listAllTags());
}

const postSchema = z.object({ name: nonEmpty(), color: hexColor });

/** Set a tag's colour. */
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  await setTagColor(parsed.value.name, parsed.value.color);
  return Response.json({ ok: true }, { status: 200 });
}

const putSchema = z.object({
  name: nonEmpty(),
  newName: ignoredIfInvalid(optionalStr()), // non-string silently ignored, as today
  // A non-string color is silently ignored (old `typeof === "string"` gate), but a string
  // that fails the hex format must still 400 - hence the preprocess instead of a bare `.optional()`.
  color: z.preprocess((v) => (typeof v === "string" ? v : undefined), hexColor.optional()),
});

/** Rename a tag (newName) and/or set its colour, keyed by name. */
export async function PUT(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.res;
  const { name, newName, color } = parsed.value;
  let current = name;
  if (newName && newName !== name) {
    await renameTag(name, newName);
    current = newName;
  }
  if (color !== undefined) {
    await setTagColor(current, color);
  }
  return Response.json({ ok: true, name: current }, { status: 200 });
}

// Distinguish "body has a string name (even blank)" from "absent/non-string" — the former
// must win outright over the query fallback, as today, even when it later 400s as blank.
const deleteSchema = z.object({ name: z.string().optional() }).catch({ name: undefined });

/** Delete a tag everywhere; name in body or ?name=. */
export async function DELETE(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const raw = await req.json().catch(() => null);
  const { name: bodyName } = deleteSchema.parse(raw);
  const name = (bodyName ?? new URL(req.url).searchParams.get("name") ?? "").trim();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  await deleteTagEverywhere(name);
  return Response.json({ ok: true }, { status: 200 });
}
