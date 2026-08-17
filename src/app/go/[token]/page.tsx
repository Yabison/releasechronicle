import { verifyActionToken } from "@/lib/actionToken";
import { prisma } from "@/lib/db";
import { nextStatus } from "@/lib/deployWorkflow";
import { DeployStatus } from "@prisma/client";
import { getServerT } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function GoPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await getServerT();
  const claim = await verifyActionToken(token);
  const wrap = (msg: React.ReactNode) => <main style={{ maxWidth: 460, margin: "80px auto", fontFamily: "var(--font)" }}>{msg}</main>;

  if (sp.done) return wrap(<p>{t("go.done")}</p>);
  if (sp.error || !claim) return wrap(<p>{t("go.invalid")}</p>);

  const ev = await prisma.event.findUnique({
    where: { id: claim.eventId },
    include: { service: { include: { product: true } } },
  });
  if (!ev || ev.type !== "DEPLOYMENT" || !ev.deployStatus) return wrap(<p>{t("go.notFound")}</p>);
  if (nextStatus(ev.deployStatus) !== (claim.to as DeployStatus)) {
    return wrap(<p>{t("go.already", { status: ev.deployStatus })}</p>);
  }

  const where = `${ev.service.product.slug}/${ev.service.slug}${ev.version ? ` (v${ev.version})` : ""}`;
  return wrap(
    <>
      <h1 style={{ fontSize: 16 }}>{t("go.title")}</h1>
      <p>{t("go.question", { what: where, from: ev.deployStatus, to: claim.to })}</p>
      <form method="post" action={`/api/go/${token}`}>
        <button type="submit">{t("common.confirm")}</button>
      </form>
    </>,
  );
}
