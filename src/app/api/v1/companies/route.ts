import { z } from "zod";
import { requireAdmin, isAdminRequest } from "@/lib/auth/guard";
import { createCompany, listCompanies } from "@/lib/hierarchy";
import { isUniqueViolation } from "@/lib/http";
import { requestScope } from "@/lib/apiVisibility";
import { nonEmpty } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const postSchema = z.object({ name: nonEmpty() });

export async function GET(req: Request) {
  const scope = await requestScope(req);
  // includeDeleted is admin-only: anyone else asking for it is silently given
  // the normal live-rows listing rather than a 400/403, since the param is an
  // enhancement to an otherwise-valid request, not a required input.
  const includeDeleted =
    new URL(req.url).searchParams.get("includeDeleted") === "1" && (await isAdminRequest(req));
  return Response.json(await listCompanies(scope.anonymous, includeDeleted));
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  try {
    const company = await createCompany({ name: parsed.value.name });
    return Response.json(company, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return Response.json({ error: "company already exists" }, { status: 409 });
    }
    throw e;
  }
}
