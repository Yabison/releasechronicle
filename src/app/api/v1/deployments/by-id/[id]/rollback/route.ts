import { z } from "zod";
import { requireWriteToken } from "@/lib/auth";
import { addRollback } from "@/lib/events";
import { runAnnotation } from "@/lib/annotate";
import { nonEmpty, optionalOrNull } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

// Old code: `typeof body.link === "string" && body.link.trim() !== ""` — a non-string
// link is silently dropped to null (not rejected), so the bare value is preprocessed
// away before it reaches optionalOrNull().
const linkField = z.preprocess((v) => (typeof v === "string" ? v : null), optionalOrNull());

const postSchema = z.object({
  comment: nonEmpty(5000),
  link: linkField,
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  return runAnnotation(() => addRollback(id, { comment: parsed.value.comment, link: parsed.value.link }));
}
