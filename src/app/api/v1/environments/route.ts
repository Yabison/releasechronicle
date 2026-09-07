import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { listEnvironments, createEnvironment } from "@/lib/environment";
import { isUniqueViolation } from "@/lib/http";
import { requestScope } from "@/lib/apiVisibility";
import { nonEmpty, hexColor } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const postSchema = z.object({ name: nonEmpty(), color: hexColor });

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
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  try {
    return Response.json(
      await createEnvironment({ name: parsed.value.name, color: parsed.value.color }),
      { status: 201 },
    );
  } catch (e) {
    if (isUniqueViolation(e)) return Response.json({ error: "an environment with this name already exists" }, { status: 400 });
    throw e;
  }
}
