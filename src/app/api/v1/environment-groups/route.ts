import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { listEnvironmentGroups, createEnvironmentGroup, getActiveEnvSlugs } from "@/lib/environment";
import { isUniqueViolation } from "@/lib/http";
import { nonEmpty } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const postSchema = z.object({
  name: nonEmpty(),
  members: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((m) => typeof m === "string") : []),
    z.array(z.string()),
  ),
});

export async function GET() {
  return Response.json(await listEnvironmentGroups());
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  const valid = await getActiveEnvSlugs();
  if (parsed.value.members.length === 0 || !parsed.value.members.every((m) => valid.includes(m))) {
    return Response.json({ error: "members must be a non-empty list of valid environment slugs" }, { status: 400 });
  }
  try {
    return Response.json(
      await createEnvironmentGroup({ name: parsed.value.name, members: parsed.value.members }),
      { status: 201 },
    );
  } catch (e) {
    if (isUniqueViolation(e)) return Response.json({ error: "a group with this name already exists" }, { status: 400 });
    throw e;
  }
}
