import { getSession } from "@/lib/auth/session";
import { listCausalCandidates } from "@/lib/causal";

/**
 * Candidate causes for the drawer's "caused by" picker: same-product events in a
 * recent window before this one. Session-gated (UI helper, not the external REST
 * API) like the sibling `updateEventCausedByAction` — no role required to read it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const rows = await listCausalCandidates(id);
  return Response.json(rows);
}
