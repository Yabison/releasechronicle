import { findIngestSourceByToken } from "@/lib/ingestSource";
import { ingestDeployment } from "@/lib/ingestDeployment";
import { emitHooks } from "@/lib/hooks/dispatch";
import "@/lib/hooks";

function readToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return new URL(req.url).searchParams.get("token");
}

export async function POST(req: Request) {
  const token = readToken(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const source = await findIngestSourceByToken(token);
  if (!source) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const r = await ingestDeployment(source, body);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });

  await emitHooks(r.event.id, "deploy.created");
  return Response.json(r.event, { status: 201 });
}
