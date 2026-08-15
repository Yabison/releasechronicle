import { requireAdmin } from "@/lib/auth/guard";
import { listEnvironmentGroups, createEnvironmentGroup, getActiveEnvSlugs } from "@/lib/environment";
import { isUniqueViolation } from "@/lib/http";

export async function GET() {
  return Response.json(await listEnvironmentGroups());
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const name = body && typeof body.name === "string" ? body.name.trim() : "";
  const members = body && Array.isArray(body.members) ? body.members.filter((m: unknown) => typeof m === "string") : [];
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  const valid = await getActiveEnvSlugs();
  if (members.length === 0 || !members.every((m: string) => valid.includes(m))) {
    return Response.json({ error: "members must be a non-empty list of valid environment slugs" }, { status: 400 });
  }
  try {
    return Response.json(await createEnvironmentGroup({ name, members }), { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return Response.json({ error: "a group with this name already exists" }, { status: 400 });
    throw e;
  }
}
