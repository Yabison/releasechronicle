import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { register } from "@/lib/hooks/registry";
import { emitHooks } from "@/lib/hooks/dispatch";
import { listDeliveries } from "@/lib/hooks/config";
import type { Connector, HookEventKind } from "@/lib/hooks/types";

register({ type: "d-ok", async send() { return { ok: true, statusCode: 200 }; } } as Connector);

async function dispatchNow(eventId: string, kind: HookEventKind, actor?: string | null) {
  const { delivered } = await emitHooks(eventId, kind, actor);
  await delivered;
}

async function seed(name: string) {
  const c = await createCompany({ name });
  const p = await createProduct({ companyId: c.id, name: `${name}-prod` });
  const s = await createService({ productId: p.id, name: `${name}-svc`, type: "API" });
  const ev = await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1.0.0" } });
  await prisma.hook.create({ data: { productId: p.id, type: "d-ok", events: ["*"], config: {}, enabled: true } });
  return { productId: p.id, eventId: ev.id };
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("delivery payload + listDeliveries", () => {
  it("stores the sent event as the delivery payload", async () => {
    const { productId, eventId } = await seed("Acme");
    await dispatchNow(eventId, "deploy.created", "al");
    const del = await prisma.hookDelivery.findFirst();
    expect((del?.payload as { kind?: string })?.kind).toBe("deploy.created");
    expect((del?.payload as { product?: string })?.product).toBe("acme-prod");
    void productId;
  });
  it("lists a product's deliveries newest-first with the hook type, excluding others", async () => {
    const a = await seed("Acme");
    const b = await seed("Beta");
    await dispatchNow(a.eventId, "deploy.created");
    await dispatchNow(b.eventId, "deploy.created");
    const { rows } = await listDeliveries(a.productId);
    expect(rows).toHaveLength(1);
    expect(rows[0].hookType).toBe("d-ok");
    expect(rows[0].status).toBe("OK");
    expect(rows[0].kind).toBe("deploy.created");
  });
  it("respects the limit", async () => {
    const { eventId, productId } = await seed("Acme");
    await dispatchNow(eventId, "deploy.created");
    await dispatchNow(eventId, "deploy.status_changed");
    const { rows } = await listDeliveries(productId, { limit: 1 });
    expect(rows).toHaveLength(1);
  });
});
