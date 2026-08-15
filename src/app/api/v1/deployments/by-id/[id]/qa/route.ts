import { requireWriteToken } from "@/lib/auth";
import { addQaValidation } from "@/lib/events";
import { runAnnotation } from "@/lib/annotate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.validatedBy !== "string" || body.validatedBy.trim() === "") {
    return Response.json({ error: "validatedBy is required" }, { status: 400 });
  }
  const comment = typeof body.comment === "string" && body.comment.trim() !== "" ? body.comment : null;
  return runAnnotation(() => addQaValidation(id, { validatedBy: body.validatedBy, comment }));
}
