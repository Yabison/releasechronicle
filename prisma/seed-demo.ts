import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type Prisma, type DeployStatus } from "@prisma/client";
import { slugify } from "../src/lib/slug";
import { wipeAll } from "./wipe";
import { seedHierarchy } from "./seed/hierarchy";
import { DEMO_HIERARCHY, DEMO_PEOPLE, DEMO_TAGS } from "./seed/demo-world";

/**
 * Publishable demo dataset: 90 days of invented release activity for Yabison,
 * generated relative to *now* so the timeline never looks stale, plus this
 * project's own git history under the "Release Chronicle" product.
 *
 * Generation is seeded from a fixed constant, so two runs produce the same world
 * shape and a bug found in the demo can be reproduced. Only the dates move.
 *
 * This is the seeder a fresh clone should run: `npm run db:seed:demo`.
 */

const DAYS = 90;
const DAY = 86_400_000;
const SEED = 0x5eed1e;

/** mulberry32 — small, deterministic, good enough to lay out a demo. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = {
  rand: () => number;
  now: number;
  events: Prisma.EventCreateManyInput[];
  transitions: Prisma.StatusTransitionCreateManyInput[];
  rollbacks: Prisma.RollbackCreateManyInput[];
  qa: Prisma.QaValidationCreateManyInput[];
  comments: Prisma.EventCommentCreateManyInput[];
  serviceBySlug: Map<string, string>;
  seq: number;
};

const pick = <T>(c: Ctx, xs: T[]): T => xs[Math.floor(c.rand() * xs.length)];
const daysAgo = (c: Ctx, d: number) => new Date(c.now - d * DAY);
const id = (c: Ctx, p: string) => `${p}-${c.seq++}`;

/** Working hours drive the HO/HNO badge: a release at 03:00 is HNO. */
const hourTypeOf = (at: Date) => {
  const h = at.getUTCHours();
  const wd = at.getUTCDay();
  return wd >= 1 && wd <= 5 && h >= 8 && h < 18 ? "HO" : "HNO";
};

/** Callers name services the way the world file does; slugify bridges to the map. */
function service(c: Ctx, name: string): string {
  const s = c.serviceBySlug.get(slugify(name));
  if (!s) throw new Error(`demo seeder: unknown service "${name}" (slug "${slugify(name)}")`);
  return s;
}

type DeployOpts = {
  slug: string;
  environment: string;
  at: Date;
  version: string;
  lot?: string | null;
  status?: DeployStatus;
  changeType?: "NORMAL" | "HOTFIX" | "PRE_MEP" | "POST_MEP" | "POSTMEP_SQL";
  requester?: string;
  tags?: string[];
  comment?: string | null;
  parentId?: string | null;
  /** Walk the workflow so DORA has lead time and the history is never empty. */
  withHistory?: boolean;
};

function deploy(c: Ctx, o: DeployOpts): string {
  const eventId = id(c, "dep");
  const status = o.status ?? "DEPLOYED";
  const requester = o.requester ?? pick(c, DEMO_PEOPLE);
  c.events.push({
    id: eventId,
    serviceId: service(c, o.slug),
    environment: o.environment,
    type: "DEPLOYMENT",
    occurredAt: o.at,
    source: "API",
    version: o.version,
    lot: o.lot ?? null,
    requester,
    changeType: o.changeType ?? "NORMAL",
    deployStatus: status,
    hourType: hourTypeOf(o.at),
    tags: o.tags ?? [],
    comment: o.comment ?? null,
    parentId: o.parentId ?? null,
    externalLink: `https://ci.yabison.example/run/${1000 + c.seq}`,
  });

  if (o.withHistory !== false) {
    // null -> PENDING -> IN_PROGRESS -> DEPLOYED, each a few minutes apart, so the
    // fiche always shows a real trail and lead time is measurable.
    const order: DeployStatus[] = ["PENDING", "IN_PROGRESS", "DEPLOYED", "TESTING", "VALIDATE"];
    const upTo = order.indexOf(status);
    let prev: DeployStatus | null = null;
    for (let i = 0; i <= upTo; i++) {
      c.transitions.push({
        eventId,
        fromStatus: prev,
        toStatus: order[i],
        actorName: i >= 3 ? pick(c, DEMO_PEOPLE) : requester,
        createdAt: new Date(o.at.getTime() + i * 7 * 60_000),
      });
      prev = order[i];
    }
    if (status === "VALIDATE") {
      c.qa.push({ eventId, validatedBy: pick(c, DEMO_PEOPLE), comment: "Recette fonctionnelle OK" });
    }
  }
  return eventId;
}

/** One release promoted along the product's environment workflow. */
function release(c: Ctx, opts: {
  master: string; deps: string[]; workflow: string[]; version: string;
  startDaysAgo: number; lot: string; tags?: string[];
}) {
  const { workflow } = opts;
  for (let i = 0; i < workflow.length; i++) {
    const env = workflow[i];
    // Each environment lands a day or so after the previous one.
    const at = daysAgo(c, opts.startDaysAgo - i * 1.2 + c.rand() * 0.3);
    const isProd = env === "PROD";
    const status: DeployStatus = isProd ? "VALIDATE" : "DEPLOYED";
    deploy(c, { slug: opts.master, environment: env, at, version: opts.version, lot: opts.lot, status, tags: opts.tags });
    // Dependencies ride along to the production-facing environments only, which is
    // what makes PROD lots multi-service and the rollback warning meaningful.
    if (isProd || env === "STAGING") {
      for (const dep of opts.deps) {
        deploy(c, {
          slug: dep, environment: env,
          at: new Date(at.getTime() + (1 + c.rand() * 3) * 60 * 60_000),
          version: opts.version, lot: opts.lot, status,
        });
      }
    }
  }
}

function incident(c: Ctx, o: {
  slug: string; environment: string; startDaysAgo: number; durationHours: number | null;
  kind: string; comment: string;
}) {
  const startedAt = daysAgo(c, o.startDaysAgo);
  const resolved = o.durationHours === null ? null : new Date(startedAt.getTime() + o.durationHours * 3600_000);
  c.events.push({
    id: id(c, "inc"),
    serviceId: service(c, o.slug),
    environment: o.environment,
    type: "INCIDENT",
    occurredAt: startedAt,
    source: "API",
    incidentType: o.kind,
    incidentStatus: resolved ? "RESOLVED" : "INVESTIGATING",
    startedAt,
    resolvedAt: resolved,
    comment: o.comment,
    tags: resolved ? [] : ["security"],
  });
}

function maintenance(c: Ctx, o: { slug: string; environment: string; daysFromNow: number; hours: number; comment: string }) {
  const start = new Date(c.now + o.daysFromNow * DAY);
  c.events.push({
    id: id(c, "mnt"),
    serviceId: service(c, o.slug),
    environment: o.environment,
    type: "MAINTENANCE",
    occurredAt: start,
    source: "API",
    windowStart: start,
    windowEnd: new Date(start.getTime() + o.hours * 3600_000),
    comment: o.comment,
    tags: [],
  });
}

/** Real commits of this project, mapped onto the Release Chronicle product. */
type Commit = { sha: string; at: string; subject: string };
function releaseChronicleHistory(c: Ctx) {
  const file = join(__dirname, "seed", "release-chronicle-history.json");
  const commits: Commit[] = JSON.parse(readFileSync(file, "utf8"));
  if (commits.length === 0) return;

  // The real history spans its own dates; compress it onto the demo window so it
  // sits alongside the invented products instead of trailing months behind.
  const first = new Date(commits[0].at).getTime();
  const last = new Date(commits[commits.length - 1].at).getTime();
  const span = Math.max(last - first, DAY);
  const at = (iso: string) => new Date(c.now - DAYS * DAY + ((new Date(iso).getTime() - first) / span) * (DAYS * DAY));

  // One DEV deployment per commit; promote to QA daily and to PROD weekly.
  let build = 100;
  let lastQa = -Infinity;
  let lastProd = -Infinity;
  for (const commit of commits) {
    const when = at(commit.at);
    build++;
    const version = String(build);
    // Terminal on purpose: these are past releases. Anything left mid-workflow would
    // look stuck in the UI and would keep the ticker busy replaying old history.
    deploy(c, {
      slug: "ReleaseChronicle", environment: "DEV", at: when, version,
      requester: "ci", comment: commit.subject, withHistory: false, status: "VALIDATE",
      tags: commit.subject.startsWith("fix") ? ["hotfix"] : [],
    });
    if (when.getTime() - lastQa > DAY) {
      lastQa = when.getTime();
      deploy(c, {
        slug: "ReleaseChronicle", environment: "QA",
        at: new Date(when.getTime() + 2 * 3600_000), version, comment: commit.subject,
        status: "VALIDATE",
      });
    }
    if (when.getTime() - lastProd > 7 * DAY) {
      lastProd = when.getTime();
      deploy(c, {
        slug: "ReleaseChronicle", environment: "PROD",
        at: new Date(when.getTime() + 26 * 3600_000), version,
        status: "VALIDATE", lot: `rc-${version}`, comment: commit.subject,
      });
    }
  }
}

/** Wipe and rebuild the whole demo world. Exported so the reset job reuses it. */
export async function seedDemo(prisma: PrismaClient): Promise<string> {
  {
    await wipeAll(prisma);
    const { serviceBySlug, companies, products, services } = await seedHierarchy(prisma, DEMO_HIERARCHY);

    const c: Ctx = {
      rand: rng(SEED), now: Date.now(), events: [], transitions: [], rollbacks: [],
      qa: [], comments: [], serviceBySlug, seq: 0,
    };

    // --- Tatanka: weekly releases, lots spanning the master and its dependencies.
    const tatankaDeps = ["TatankaAuth", "TatankaBilling", "TatankaSearch", "TatankaGateway"];
    let minor = 4;
    for (let d = DAYS; d > 3; d -= 7) {
      const version = `4.${minor++}.0`;
      release(c, {
        master: "Tatanka", deps: tatankaDeps.slice(0, 2 + Math.floor(c.rand() * 3)),
        workflow: ["DEV", "QA", "STAGING", "PROD"], version,
        startDaysAgo: d, lot: `tatanka-${version}`,
      });
    }

    // --- ayaní: slower cadence, shorter workflow.
    let patch = 1;
    for (let d = DAYS - 4; d > 3; d -= 11) {
      const version = `2.3.${patch++}`;
      release(c, {
        master: "ayaní", deps: ["ayaníIngest", "ayaníWarehouse"],
        workflow: ["QA", "STAGING", "PROD"], version,
        startDaysAgo: d, lot: `ayani-${version}`, tags: ["db-migration"],
      });
    }

    // --- iinnii: monthly, two environments.
    let build = 880;
    for (let d = DAYS - 8; d > 3; d -= 30) {
      const version = String((build += 7));
      release(c, {
        master: "iinnii", deps: [], workflow: ["QA", "PROD"], version,
        startDaysAgo: d, lot: `iinnii-${version}`,
      });
    }

    // --- Release Chronicle: this project's own history.
    releaseChronicleHistory(c);

    // --- Kaleido (private company), so the public/private split has real content.
    for (let d = DAYS - 6; d > 5; d -= 14) {
      const version = `1.${Math.floor((DAYS - d) / 14) + 2}.0`;
      release(c, {
        master: "Prism", deps: ["PrismRender"], workflow: ["QA", "PROD"],
        version, startDaysAgo: d, lot: `prism-${version}`,
      });
    }

    // --- A hotfix with its PRE and POST MEP phases.
    const hotfixAt = daysAgo(c, 9);
    const hotfixId = deploy(c, {
      slug: "Tatanka", environment: "PROD", at: hotfixAt, version: "4.11.1",
      changeType: "HOTFIX", status: "VALIDATE", lot: "tatanka-4.11.1", tags: ["hotfix"],
      comment: "Correctif de la fuite de session sur /checkout",
    });
    deploy(c, {
      slug: "Tatanka", environment: "PROD", at: new Date(hotfixAt.getTime() - 90 * 60_000),
      version: "4.11.1", changeType: "PRE_MEP", status: "VALIDATE", parentId: hotfixId,
      comment: "Sauvegarde de la base et gel des écritures", withHistory: true,
    });
    deploy(c, {
      slug: "Tatanka", environment: "PROD", at: new Date(hotfixAt.getTime() + 3 * 3600_000),
      version: "4.11.1", changeType: "POST_MEP", status: "DEPLOYED", parentId: hotfixId,
      comment: "Vérification des compteurs de facturation",
    });

    // --- A rollback: a higher build reverted by a lower one the same day.
    const badAt = daysAgo(c, 16);
    const badId = deploy(c, {
      slug: "ayaníIngest", environment: "PROD", at: badAt, version: "2412",
      status: "DEPLOYED", tags: ["rollback"], comment: "Régression sur le parseur CSV",
    });
    c.rollbacks.push({ eventId: badId, comment: "Retour à 2408 : ingestion bloquée en production" });
    deploy(c, {
      slug: "ayaníIngest", environment: "PROD", at: new Date(badAt.getTime() + 5 * 3600_000),
      version: "2408", status: "VALIDATE", comment: "Retour arrière",
    });

    // --- In-flight right now, so an open tab has something to watch.
    deploy(c, { slug: "Tatanka", environment: "STAGING", at: daysAgo(c, 0.04), version: "4.19.0", status: "IN_PROGRESS", lot: "tatanka-4.19.0" });
    deploy(c, { slug: "TatankaSearch", environment: "QA", at: daysAgo(c, 0.1), version: "4.19.0", status: "TESTING", lot: "tatanka-4.19.0" });
    deploy(c, { slug: "iinnii", environment: "QA", at: daysAgo(c, 0.2), version: "901", status: "PENDING" });

    // --- Scheduled ahead of time (feeds the calendar and the GO workflow).
    const scheduled = id(c, "dep");
    c.events.push({
      id: scheduled, serviceId: service(c, "Tatanka"), environment: "PROD",
      type: "DEPLOYMENT", occurredAt: new Date(c.now + 2 * DAY), source: "API",
      version: "4.19.0", lot: "tatanka-4.19.0", requester: pick(c, DEMO_PEOPLE),
      changeType: "NORMAL", deployStatus: "SCHEDULED", scheduledAt: new Date(c.now + 2 * DAY),
      hourType: "HNO", tags: [], comment: "Fenêtre de MEP mensuelle",
    });

    // --- Incidents: two closed for MTTR, one still open for the sidebar counter.
    incident(c, { slug: "TatankaBilling", environment: "PROD", startDaysAgo: 34, durationHours: 3.5, kind: "outage", comment: "Timeouts sur le prestataire de paiement" });
    incident(c, { slug: "ayaníWarehouse", environment: "PROD", startDaysAgo: 12, durationHours: 1.25, kind: "degradation", comment: "Requêtes lentes après la migration d'index" });
    incident(c, { slug: "TatankaGateway", environment: "PROD", startDaysAgo: 0.6, durationHours: null, kind: "degradation", comment: "Taux d'erreur 5xx élevé sur eu-west" });

    // --- Maintenance: one past, one upcoming (calendar + sidebar badge).
    maintenance(c, { slug: "ayaníWarehouse", environment: "PROD", daysFromNow: -21, hours: 2, comment: "Montée de version PostgreSQL" });
    maintenance(c, { slug: "Tatanka", environment: "PROD", daysFromNow: 5, hours: 3, comment: "Bascule du répartiteur de charge" });

    await prisma.event.createMany({ data: c.events });
    if (c.transitions.length) await prisma.statusTransition.createMany({ data: c.transitions });
    if (c.rollbacks.length) await prisma.rollback.createMany({ data: c.rollbacks });
    if (c.qa.length) await prisma.qaValidation.createMany({ data: c.qa });

    // --- Build drift: the agent reports something other than the last DEPLOYED build.
    await prisma.runtimeState.create({
      data: { serviceId: service(c, "TatankaAuth"), environment: "PROD", build: "4.17.0" },
    });

    // A couple of threads so the fiche is not empty of conversation.
    const withComments = c.events.filter((e) => e.type === "DEPLOYMENT").slice(-6, -3);
    for (const e of withComments) {
      await prisma.eventComment.create({
        data: { eventId: e.id as string, author: pick(c, DEMO_PEOPLE), body: "Vérifié côté monitoring, rien à signaler." },
      });
    }

    const deployments = c.events.filter((e) => e.type === "DEPLOYMENT").length;
    return (
      `${companies} companies, ${products} products, ${services} services, ` +
      `${deployments} deployments, ${c.events.length - deployments} incidents/maintenances, ` +
      `${c.transitions.length} transitions, over the last ${DAYS} days. Tags: ${DEMO_TAGS.join(", ")}.`
    );
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("Demo seeded: " + (await seedDemo(prisma)));
  } finally {
    await prisma.$disconnect();
  }
}

// Run directly: `tsx prisma/seed-demo.ts`
if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
