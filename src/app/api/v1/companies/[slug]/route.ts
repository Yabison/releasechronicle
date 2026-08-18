import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { getCompanyBySlug } from "@/lib/hierarchy";
import { prisma } from "@/lib/db";
import { ignoredIfInvalid } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const putSchema = z.object({
  autoLotNaming: z.enum(["master", "date"]).optional(),
  sortOrder: ignoredIfInvalid(z.number().int()),
  public: ignoredIfInvalid(z.boolean()),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const company = await getCompanyBySlug(slug);
  if (!company) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(company);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const company = await getCompanyBySlug(slug);
  if (!company) return Response.json({ error: "not found" }, { status: 404 });
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.res;
  const data: { autoLotNaming?: string; sortOrder?: number; public?: boolean } = {};
  if (parsed.value.autoLotNaming !== undefined) data.autoLotNaming = parsed.value.autoLotNaming;
  if (parsed.value.sortOrder !== undefined) data.sortOrder = parsed.value.sortOrder;
  if (parsed.value.public !== undefined) data.public = parsed.value.public;
  if (Object.keys(data).length === 0) {
    return Response.json({ error: "autoLotNaming, sortOrder or public is required" }, { status: 400 });
  }
  const updated = await prisma.company.update({ where: { id: company.id }, data });
  return Response.json(updated, { status: 200 });
}
