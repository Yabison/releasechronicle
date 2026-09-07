import { ChangelogVisibility } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/guard";
import {
  getPublicEventTypes, setPublicEventTypes,
  getChangelogVisibility, setChangelogVisibility,
} from "@/lib/visibility";

const MODES = Object.values(ChangelogVisibility) as string[];

async function current() {
  const [eventTypes, changelogVisibility] = await Promise.all([
    getPublicEventTypes(),
    getChangelogVisibility(),
  ]);
  return { eventTypes, changelogVisibility };
}

export async function GET() {
  return Response.json(await current());
}

export async function PUT(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "a json body is required" }, { status: 400 });

  // Les deux réglages sont indépendants, et chacun n'est touché que s'il est
  // présent : l'écran d'admin envoie l'un ou l'autre, et un PUT partiel ne doit
  // pas remettre à son défaut celui qu'il ne porte pas.
  const hasTypes = body.eventTypes !== undefined;
  const hasMode = body.changelogVisibility !== undefined;
  if (!hasTypes && !hasMode) {
    return Response.json({ error: "eventTypes or changelogVisibility is required" }, { status: 400 });
  }
  if (hasTypes && (!Array.isArray(body.eventTypes) || !body.eventTypes.every((t: unknown) => typeof t === "string"))) {
    return Response.json({ error: "eventTypes must be an array of strings" }, { status: 400 });
  }
  if (hasMode && !MODES.includes(body.changelogVisibility)) {
    return Response.json({ error: `changelogVisibility must be one of ${MODES.join(", ")}` }, { status: 400 });
  }

  // Tout est validé avant la première écriture : un corps mixte à moitié invalide
  // ne doit pas laisser sa moitié valide appliquée.
  if (hasTypes) await setPublicEventTypes(body.eventTypes);
  if (hasMode) await setChangelogVisibility(body.changelogVisibility);
  return Response.json(await current(), { status: 200 });
}
