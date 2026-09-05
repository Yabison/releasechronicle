import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOverviewExtras, getOverview, findVisibleProduct } from "@/lib/overview";
import { OverviewDashboard } from "@/components/OverviewDashboard";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ company: string; product: string }> }) {
  const { company, product } = await params;
  const session = await getSession();
  const anon = !session;
  // 404, not 403: confirming a private product exists is already the leak.
  const found = await findVisibleProduct(company, product, anon);
  if (!found) notFound();
  const overview = await getOverview({ company, product }, anon);
  const extras = await getOverviewExtras(overview.events);
  return <OverviewDashboard overview={overview} {...extras} companyName={found.company.name} productName={found.name} />;
}
