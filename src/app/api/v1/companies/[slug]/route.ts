import { requireAdmin } from "@/lib/auth/guard";
import { getCompanyBySlug } from "@/lib/hierarchy";
import { prisma } from "@/lib/db";

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
  const body = await req.json().catch(() => null);
  const data: { autoLotNaming?: string; sortOrder?: number; public?: boolean } = {};
  if (body && "autoLotNaming" in body) {
    if (body.autoLotNaming !== "master" && body.autoLotNaming !== "date") {
      return Response.json({ error: "autoLotNaming must be master|date" }, { status: 400 });
    }
    data.autoLotNaming = body.autoLotNaming;
  }
  if (body && Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
  if (typeof body?.public === "boolean") data.public = body.public;
  if (Object.keys(data).length === 0) {
    return Response.json({ error: "autoLotNaming, sortOrder or public is required" }, { status: 400 });
  }
  const updated = await prisma.company.update({ where: { id: company.id }, data });
  return Response.json(updated, { status: 200 });
}
