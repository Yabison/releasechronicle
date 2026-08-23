/**
 * Functional walkthrough of the notification hooks.
 *
 *   npx tsx scripts/functional-hooks.ts
 *
 * Drives one deployment through every status, undoes a step, rolls it back,
 * then raises an incident and a maintenance — so every HookEventKind fires at
 * least once, against every connector, in both template languages.
 *
 * What it is for: answering "do we actually receive everything by mail". That
 * question is not answered by assertions, it is answered by reading the mail —
 * so this prints where to go and leaves the evidence behind rather than
 * cleaning up after itself:
 *
 *   emails   http://localhost:8025          (Mailpit)
 *   webhooks the receiver output below, and /admin/logs for what was stored
 *
 * It WRITES REAL ROWS: hooks, events, transitions, deliveries. It refuses to
 * run against a database whose name does not look like a development one, the
 * same guard prisma/demo-guard.ts applies to the demo jobs.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { prisma } from "../src/lib/db";
import { createEvent, transitionDeployStatus, undoDeployStatus, rollbackToPreviousVersion } from "../src/lib/events";
import { emitHooks } from "../src/lib/hooks/dispatch";
import { DEPLOY_ORDER } from "../src/lib/deployWorkflow";
import type { DeployStatus } from "@prisma/client";

const RECEIVER_PORT = Number(process.env.RC_HOOK_RECEIVER_PORT ?? 4599);
const ACTOR = "functional-test";
/** Any environment works; a fixed one keeps the run comparable between passes. */
const ENV = process.env.RC_HOOK_ENV ?? "PROD";

/** Refuse anything that is not obviously a scratch database. */
function assertDevTarget(): void {
  const url = process.env.DATABASE_URL ?? "";
  const name = url.split("/").pop()?.split("?")[0] ?? "";
  if (!name || /prod/i.test(name) || !/(dev|test|demo|releasechronicle)$/i.test(name)) {
    throw new Error(
      `Refusing to run against "${name}": this script creates hooks and events. ` +
        "Point DATABASE_URL at a development database.",
    );
  }
}

type Received = { at: string; path: string; body: unknown };

function startReceiver(received: Received[]) {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body: unknown = raw;
      try { body = JSON.parse(raw); } catch { /* keep the raw text */ }
      received.push({ at: new Date().toISOString(), path: req.url ?? "/", body });
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  return new Promise<() => Promise<void>>((resolve) => {
    server.listen(RECEIVER_PORT, () => {
      console.log(`receiver listening on http://localhost:${RECEIVER_PORT}`);
      resolve(() => new Promise((done) => server.close(() => done())));
    });
  });
}

/** A product to hang the hooks off, and the service its events belong to. */
async function pickService() {
  const service = await prisma.service.findFirst({
    where: { deletedAt: null, product: { deletedAt: null } },
    include: { product: { include: { company: true } } },
  });
  if (!service) throw new Error("No service in this database — seed one first (npm run db:seed:demo).");
  return service;
}

async function createHooks(productId: string) {
  // "*" on every kind: the point is to miss nothing.
  const specs = [
    { type: "webhook", config: { url: `http://localhost:${RECEIVER_PORT}/hook` } },
    { type: "email", config: { to: ["functional-test@example.org"], locale: "fr" } },
    { type: "email", config: { to: ["functional-test-en@example.org"], locale: "en" } },
    // Both shapes: the legacy Office 365 card and the Adaptive Card a Power
    // Automate flow expects. Teams answers 200 to either, so only reading them
    // tells you which one you actually built.
    { type: "teams", config: { url: `http://localhost:${RECEIVER_PORT}/teams`, locale: "fr" } },
    { type: "teams", config: { url: `http://localhost:${RECEIVER_PORT}/teams`, locale: "en" } },
    { type: "teams", config: { url: `http://localhost:${RECEIVER_PORT}/teams-adaptive`, locale: "fr", format: "adaptive" } },
  ];
  const created = [];
  for (const spec of specs) {
    created.push(
      await prisma.hook.create({
        data: { productId, type: spec.type, events: ["*"], config: spec.config, enabled: true },
      }),
    );
  }
  return created;
}


type MessageCard = { "@type"?: string; "@context"?: string; summary?: string; title?: string; text?: string };

/**
 * What a Teams channel would actually show.
 *
 * Teams renders a legacy MessageCard: a title line and a body. A card whose
 * title or text came out empty still posts and still returns 200 — it simply
 * appears blank in the channel — so the transport being OK says nothing about
 * the message being readable. That is what this checks.
 */
function reportTeams(cards: Received[]): void {
  if (cards.length === 0) {
    console.log("\nno Teams card received");
    return;
  }

  const problems: string[] = [];
  const shown = new Set<string>();
  console.log("\nTeams cards, as a channel would render them");

  for (const { body } of cards) {
    const card = body as MessageCard;
    const key = `${card.title}||${card.text}`;
    if (card["@type"] !== "MessageCard") problems.push(`@type is ${card["@type"] ?? "missing"}, expected MessageCard`);
    if (!card.summary?.trim()) problems.push("summary is empty (Teams uses it for the notification toast)");
    if (!card.title?.trim()) problems.push("title is empty — the card renders blank");
    if (!card.text?.trim()) problems.push("text is empty");
    if (shown.has(key)) continue;
    shown.add(key);
    console.log(`\n  ${card.title}`);
    console.log(`  ${card.text}`);
  }

  const unique = [...new Set(problems)];
  console.log(
    unique.length
      ? `\nTeams card problems:\n  ${unique.join("\n  ")}`
      : `\nevery Teams card carries a type, a summary, a title and a body (${cards.length} cards, ${shown.size} distinct)`,
  );
}


/** The Adaptive Card path: what a Power Automate flow would hand to a channel. */
function reportAdaptive(cards: Received[]): void {
  if (cards.length === 0) {
    console.log("\nno Adaptive Card received");
    return;
  }
  const first = cards[0].body as {
    type?: string;
    attachments?: { contentType?: string; content?: { body?: { text?: string }[]; actions?: { url?: string }[] } }[];
  };
  const content = first.attachments?.[0]?.content;
  console.log(`\nAdaptive Cards: ${cards.length} received`);
  console.log(`  envelope    ${first.type} / ${first.attachments?.[0]?.contentType}`);
  console.log(`  heading     ${content?.body?.[0]?.text ?? "(none)"}`);
  console.log(`  body        ${(content?.body?.[1]?.text ?? "").split("\n")[0]}`);
  console.log(`  action      ${content?.actions?.[0]?.url ? "button present" : "no button"}`);
}

type Step = { label: string; kind: string };

async function run() {
  assertDevTarget();

  const received: Received[] = [];
  const stopReceiver = await startReceiver(received);
  const service = await pickService();
  const where = `${service.product.company.name} / ${service.product.name} / ${service.name}`;
  console.log(`\ntarget: ${where}\n`);

  const hooks = await createHooks(service.productId);
  console.log(`hooks created: ${hooks.map((h) => h.type).join(", ")}\n`);

  const steps: Step[] = [];
  const version = `func-${Date.now().toString(36)}`;

  // 1. A deployment, walked through every status in order.
  const deploy = await createEvent({
    serviceId: service.id,
    type: "DEPLOYMENT",
    environment: ENV,
    occurredAt: new Date(),
    tags: ["functional-test"],
    fields: {
      version,
      requester: ACTOR,
      changeType: "NORMAL",
      deployStatus: DEPLOY_ORDER[0],
      scheduledAt: new Date(Date.now() + 3_600_000),
      comment: "functional walkthrough",
    },
  });
  await (await emitHooks(deploy.id, "deploy.created", ACTOR)).delivered;
  steps.push({ label: `created ${version}`, kind: "deploy.created" });

  for (let i = 1; i < DEPLOY_ORDER.length; i++) {
    const to = DEPLOY_ORDER[i] as DeployStatus;
    await transitionDeployStatus(deploy.id, {
      to,
      actorName: ACTOR,
      actorEmail: "functional-test@example.org",
      // VALIDATE requires a comment; giving one everywhere keeps the mails comparable.
      comment: `moving to ${to}`,
    });
    await (await emitHooks(deploy.id, "deploy.status_changed", ACTOR)).delivered;
    steps.push({ label: `${DEPLOY_ORDER[i - 1]} → ${to}`, kind: "deploy.status_changed" });
  }

  // 2. Undo the last step, then roll the deployment back.
  await undoDeployStatus(deploy.id, { actorName: ACTOR, actorEmail: null, comment: "undo, functional test" });
  await (await emitHooks(deploy.id, "deploy.status_undone", ACTOR)).delivered;
  steps.push({ label: "undo last transition", kind: "deploy.status_undone" });

  await rollbackToPreviousVersion(deploy.id, ACTOR, "rollback, functional test");
  await (await emitHooks(deploy.id, "deploy.rolled_back", ACTOR)).delivered;
  steps.push({ label: "rollback", kind: "deploy.rolled_back" });

  // 3. The two other kinds.
  const incident = await createEvent({
    serviceId: service.id,
    type: "INCIDENT",
    environment: ENV,
    occurredAt: new Date(),
    tags: ["functional-test"],
    fields: { startedAt: new Date(), incidentType: "OUTAGE", comment: "functional walkthrough incident" },
  });
  await (await emitHooks(incident.id, "incident.created", ACTOR)).delivered;
  steps.push({ label: "incident opened", kind: "incident.created" });

  const maintenance = await createEvent({
    serviceId: service.id,
    type: "MAINTENANCE",
    environment: ENV,
    occurredAt: new Date(),
    tags: ["functional-test"],
    fields: {
      windowStart: new Date(Date.now() + 86_400_000),
      windowEnd: new Date(Date.now() + 90_000_000),
      comment: "functional walkthrough maintenance",
    },
  });
  await (await emitHooks(maintenance.id, "maintenance.created", ACTOR)).delivered;
  steps.push({ label: "maintenance scheduled", kind: "maintenance.created" });

  // Deliveries are written before the HTTP attempt; give the in-flight ones a
  // moment so the summary counts what actually happened.
  await new Promise((r) => setTimeout(r, 1500));

  const hookIds = hooks.map((h) => h.id);
  const deliveries = await prisma.hookDelivery.findMany({
    where: { hookId: { in: hookIds } },
    include: { hook: true },
    orderBy: { createdAt: "asc" },
  });

  console.log("steps fired");
  for (const s of steps) console.log(`  ${s.kind.padEnd(24)} ${s.label}`);

  console.log("\ndeliveries by connector and outcome");
  const byType = new Map<string, Map<string, number>>();
  for (const d of deliveries) {
    const perType = byType.get(d.hook.type) ?? new Map<string, number>();
    perType.set(d.status, (perType.get(d.status) ?? 0) + 1);
    byType.set(d.hook.type, perType);
  }
  for (const [type, outcomes] of byType) {
    const parts = [...outcomes].map(([status, n]) => `${status}=${n}`).join(" ");
    console.log(`  ${type.padEnd(10)} ${parts}`);
  }

  const failed = deliveries.filter((d) => d.status !== "OK");
  if (failed.length) {
    console.log("\nnot delivered");
    for (const d of failed) {
      console.log(`  ${d.hook.type.padEnd(10)} ${d.kind.padEnd(24)} ${d.status} ${d.statusCode ?? ""} ${d.error ?? ""}`);
    }
  }

  // What every kind should have produced, against what it did.
  const expected = new Set(steps.map((s) => s.kind));
  const seen = new Set(deliveries.map((d) => d.kind));
  const missing = [...expected].filter((k) => !seen.has(k));
  console.log(
    missing.length
      ? `\nMISSING: no delivery recorded for ${missing.join(", ")}`
      : `\nevery kind produced at least one delivery (${expected.size} kinds, ${deliveries.length} deliveries)`,
  );

  const webhookBodies = received.filter((r) => r.path.startsWith("/hook"));
  const teamsCards = received.filter((r) => r.path === "/teams");
  const adaptiveCards = received.filter((r) => r.path === "/teams-adaptive");
  console.log(
    `\nreceived by the local receiver: ${webhookBodies.length} webhook, ` +
      `${teamsCards.length} teams (legacy), ${adaptiveCards.length} teams (adaptive)`,
  );
  if (webhookBodies[0]) console.log(`  webhook, first: ${JSON.stringify(webhookBodies[0].body).slice(0, 200)}…`);

  reportTeams(teamsCards);
  reportAdaptive(adaptiveCards);

  console.log(`
where to look now
  emails    http://localhost:8025
  payloads  http://localhost:3000/admin/logs
  the run   version ${version}, actor ${ACTOR}

The hooks and events created here are left in place on purpose: the mails and
the deliveries are the result, and deleting them would delete the evidence.
Remove them from Admin → Hooks when you are done.
`);

  await stopReceiver();
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
