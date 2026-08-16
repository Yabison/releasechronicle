import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOverview, findVisibleCompany } from "@/lib/overview";
import { OverviewDashboard } from "@/components/OverviewDashboard";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const session = await getSession();
  const anon = !session;
  // 404, not 403: confirming a private company exists is already the leak.
  const found = await findVisibleCompany(company, anon);
  if (!found) notFound();
  const overview = await getOverview({ company }, anon);
  return <OverviewDashboard overview={overview} companyName={found.name} />;
}
