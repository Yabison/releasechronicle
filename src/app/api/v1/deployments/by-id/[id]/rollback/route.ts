import { requireWriteToken } from "@/lib/auth";
import { addRollback } from "@/lib/events";
import { runAnnotation } from "@/lib/annotate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.comment !== "string" || body.comment.trim() === "") {
    return Response.json({ error: "comment is required" }, { status: 400 });
  }
  const link = typeof body.link === "string" && body.link.trim() !== "" ? body.link : null;
  return runAnnotation(() => addRollback(id, { comment: body.comment, link }));
}
