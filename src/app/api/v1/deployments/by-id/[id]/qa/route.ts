import { z } from "zod";
import { requireWriteToken } from "@/lib/auth";
import { addQaValidation } from "@/lib/events";
import { runAnnotation } from "@/lib/annotate";
import { nonEmpty, optionalOrNull } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

// Old code: `typeof body.comment === "string" && body.comment.trim() !== ""` — a
// non-string comment is silently dropped to null (not rejected), so the bare value is
// preprocessed away before it reaches optionalOrNull().
const commentField = z.preprocess((v) => (typeof v === "string" ? v : null), optionalOrNull(5000));

const postSchema = z.object({
  validatedBy: nonEmpty(),
  comment: commentField,
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  return runAnnotation(() => addQaValidation(id, { validatedBy: parsed.value.validatedBy, comment: parsed.value.comment }));
}
