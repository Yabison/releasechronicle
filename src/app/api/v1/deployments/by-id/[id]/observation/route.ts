import { requireWriteToken } from "@/lib/auth";
import { addObservation } from "@/lib/events";
import { runAnnotation } from "@/lib/annotate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.who !== "string" ||
    body.who.trim() === "" ||
    typeof body.durationMinutes !== "number" ||
    !Number.isFinite(body.durationMinutes)
  ) {
    return Response.json({ error: "who and a numeric durationMinutes are required" }, { status: 400 });
  }
  const comment = typeof body.comment === "string" && body.comment.trim() !== "" ? body.comment : null;
  return runAnnotation(() => addObservation(id, { who: body.who, durationMinutes: body.durationMinutes, comment }));
}
