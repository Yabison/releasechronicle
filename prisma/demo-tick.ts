import "dotenv/config";
import { PrismaClient, DeployStatus, type Prisma } from "@prisma/client";
import { nextStatus } from "../src/lib/deployWorkflow";
import { transitionDeployStatus, createEvent } from "../src/lib/events";
import { DEMO_PEOPLE } from "./seed/demo-world";
import { assertDemoTarget } from "./demo-guard";

/**
 * Keeps the demo moving between resets: every tick it advances a few in-flight
 * deployments one step, starts a new one now and then, and occasionally opens or
 * closes an incident. A visitor who leaves the tab open sees the timeline change,
 * which is the whole point of a live demo.
 *
 * It calls the domain layer rather than the REST API on purpose: there is no REST
 * endpoint for a status transition (the UI uses a server action, notifications use
 * a one-click token), so going through HTTP would only cover event creation while
 * adding a base URL, a token and a readiness race to the deployment.
 *
 * Runs one pass and exits — the scheduler decides the cadence. Guarded: see
 * demo-guard.ts.
 */

const rnd = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const chance = (p: number) => Math.random() < p;

/** Statuses a demo deployment can still move forward from. */
const IN_FLIGHT: DeployStatus[] = [
  DeployStatus.SCHEDULED, DeployStatus.GO_CONFIRMED, DeployStatus.PENDING,
  DeployStatus.IN_PROGRESS, DeployStatus.DEPLOYED, DeployStatus.TESTING,
];

/** Only recent work is "in flight"; a two-month-old deployment is history and must
 *  not start moving again just because it never reached VALIDATE. */
const RECENT_MS = 3 * 86_400_000;

async function advanceSome(prisma: PrismaClient, log: string[]) {
  const candidates = await prisma.event.findMany({
    where: {
      type: "DEPLOYMENT", deletedAt: null, deployStatus: { in: IN_FLIGHT },
      occurredAt: { gte: new Date(Date.now() - RECENT_MS) },
    },
    orderBy: { occurredAt: "desc" },
    take: 25,
    select: { id: true, deployStatus: true, version: true, environment: true, service: { select: { name: true } } },
  });
  if (candidates.length === 0) return;

  const howMany = 1 + Math.floor(Math.random() * 3);
  for (const ev of candidates.sort(() => Math.random() - 0.5).slice(0, howMany)) {
    const to = ev.deployStatus ? nextStatus(ev.deployStatus) : null;
    if (!to) continue;
    // VALIDATE requires a comment, exactly as the UI enforces.
    const comment = to === DeployStatus.VALIDATE ? "Recette OK (démo automatique)" : null;
    await transitionDeployStatus(ev.id, { to, actorName: rnd(DEMO_PEOPLE), actorEmail: null, comment });
    log.push(`${ev.service.name} ${ev.version ?? ""} (${ev.environment}) ${ev.deployStatus} → ${to}`);
  }
}

async function maybeStartDeployment(prisma: PrismaClient, log: string[]) {
  if (!chance(0.35)) return;
  // Only start things in the lower environments: PROD releases stay scripted so the
  // demo never invents a production deploy out of nowhere.
  const service = await prisma.service.findFirst({
    where: { deletedAt: null, isMaster: true, product: { company: { public: true } } },
    orderBy: { sortOrder: "asc" },
    skip: Math.floor(Math.random() * 3),
    select: { id: true, name: true, product: { select: { envWorkflow: true } } },
  });
  if (!service) return;
  const envs = service.product.envWorkflow.filter((e) => e !== "PROD");
  if (envs.length === 0) return;
  const environment = rnd(envs);

  const last = await prisma.event.findFirst({
    where: { serviceId: service.id, type: "DEPLOYMENT", version: { not: null } },
    orderBy: { occurredAt: "desc" },
    select: { version: true },
  });
  const version = bumpVersion(last?.version ?? "1.0.0");

  await createEvent({
    serviceId: service.id,
    environment,
    type: "DEPLOYMENT",
    occurredAt: new Date(),
    tags: [],
    fields: {
      version, requester: rnd(DEMO_PEOPLE), changeType: "NORMAL",
      deployStatus: DeployStatus.PENDING, lot: null,
    },
  } as never);
  log.push(`nouveau déploiement ${service.name} ${version} (${environment})`);
}

/** 4.12.0 → 4.12.1, 880 → 881; anything else gets a numeric suffix. */
function bumpVersion(v: string): string {
  if (/^\d+$/.test(v)) return String(Number(v) + 1);
  const m = v.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${v}.1`;
}

async function maybeMoveIncident(prisma: PrismaClient, log: string[]) {
  if (!chance(0.15)) return;
  const open = await prisma.event.findFirst({
    where: { type: "INCIDENT", deletedAt: null, resolvedAt: null },
    orderBy: { startedAt: "asc" },
    select: { id: true, service: { select: { name: true } } },
  });
  if (open) {
    await prisma.event.update({
      where: { id: open.id },
      data: { resolvedAt: new Date(), incidentStatus: "RESOLVED" },
    });
    log.push(`incident résolu sur ${open.service.name}`);
    return;
  }
  const service = await prisma.service.findFirst({
    where: { deletedAt: null, product: { company: { public: true } } },
    skip: Math.floor(Math.random() * 5),
    select: { id: true, name: true },
  });
  if (!service) return;
  const startedAt = new Date();
  await prisma.event.create({
    data: {
      serviceId: service.id, environment: "PROD", type: "INCIDENT", occurredAt: startedAt,
      incidentType: rnd(["outage", "degradation", "latency"]),
      incidentStatus: "INVESTIGATING", startedAt,
      comment: "Détecté par la supervision (démo automatique)",
      tags: [],
    } as Prisma.EventUncheckedCreateInput,
  });
  log.push(`incident ouvert sur ${service.name}`);
}

async function main() {
  assertDemoTarget();
  const prisma = new PrismaClient();
  const log: string[] = [];
  try {
    await advanceSome(prisma, log);
    await maybeStartDeployment(prisma, log);
    await maybeMoveIncident(prisma, log);
    const stamp = new Date().toISOString();
    console.log(log.length ? `[demo-tick] ${stamp}\n  ${log.join("\n  ")}` : `[demo-tick] ${stamp} rien à faire`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`[demo-tick] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
