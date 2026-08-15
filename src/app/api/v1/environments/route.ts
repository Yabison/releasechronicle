import { requireAdmin } from "@/lib/auth/guard";
import { listEnvironments, createEnvironment } from "@/lib/environment";
import { isUniqueViolation } from "@/lib/http";
import { requestScope } from "@/lib/apiVisibility";

export async function GET(req: Request) {
  const scope = await requestScope(req);
  const envs = await listEnvironments();
  // An environment name alone can disclose internal topology, and a public visitor
  // has no use for one whose events they cannot see.
  return Response.json(scope.anonymous ? envs.filter((e) => e.public) : envs);
}
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const name = body && typeof body.name === "string" ? body.name.trim() : "";
  const color = body && typeof body.color === "string" ? body.color.trim() : "";
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  if (!/^#[0-9a-f]{6}$/i.test(color)) return Response.json({ error: "color must be #rrggbb" }, { status: 400 });
  try {
    return Response.json(await createEnvironment({ name, color }), { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return Response.json({ error: "an environment with this name already exists" }, { status: 400 });
    throw e;
  }
}
