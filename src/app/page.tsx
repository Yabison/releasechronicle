import { getSession } from "@/lib/auth/session";
import { getOverview } from "@/lib/overview";
import { OverviewDashboard } from "@/components/OverviewDashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  const overview = await getOverview({}, !session);
  return <OverviewDashboard overview={overview} />;
}
