import { requireAdmin } from "@/lib/auth/guard";
import { createCompany, listCompanies } from "@/lib/hierarchy";
import { isUniqueViolation } from "@/lib/http";
import { requestScope } from "@/lib/apiVisibility";

export async function GET(req: Request) {
  const scope = await requestScope(req);
  return Response.json(await listCompanies(scope.anonymous));
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || body.name.trim() === "") {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  try {
    const company = await createCompany({ name: body.name.trim() });
    return Response.json(company, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return Response.json({ error: "company already exists" }, { status: 409 });
    }
    throw e;
  }
}
