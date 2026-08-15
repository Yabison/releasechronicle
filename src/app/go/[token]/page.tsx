import { verifyActionToken } from "@/lib/actionToken";
import { prisma } from "@/lib/db";
import { nextStatus } from "@/lib/deployWorkflow";
import { DeployStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function GoPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const claim = await verifyActionToken(token);
  const wrap = (msg: React.ReactNode) => <main style={{ maxWidth: 460, margin: "80px auto", fontFamily: "var(--font)" }}>{msg}</main>;

  if (sp.done) return wrap(<p>✅ Action effectuée. Merci !</p>);
  if (sp.error || !claim) return wrap(<p>Lien invalide, expiré, ou action déjà effectuée.</p>);

  const ev = await prisma.event.findUnique({
    where: { id: claim.eventId },
    include: { service: { include: { product: true } } },
  });
  if (!ev || ev.type !== "DEPLOYMENT" || !ev.deployStatus) return wrap(<p>Déploiement introuvable.</p>);
  if (nextStatus(ev.deployStatus) !== (claim.to as DeployStatus)) {
    return wrap(<p>Cette action a déjà été effectuée (statut actuel : {ev.deployStatus}).</p>);
  }

  const where = `${ev.service.product.slug}/${ev.service.slug}`;
  return wrap(
    <>
      <h1 style={{ fontSize: 16 }}>Confirmer l’action</h1>
      <p>Passer <strong>{where}</strong> {ev.version ? `(v${ev.version})` : ""} de <strong>{ev.deployStatus}</strong> à <strong>{claim.to}</strong> ?</p>
      <form method="post" action={`/api/go/${token}`}>
        <button type="submit">Confirmer</button>
      </form>
    </>,
  );
}
