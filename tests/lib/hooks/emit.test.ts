import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { register } from "@/lib/hooks/registry";
import { emitHooks } from "@/lib/hooks/dispatch";
import type { Connector } from "@/lib/hooks/types";

register({ type: "t-emit", async send() { return { ok: true, statusCode: 200 }; } } as Connector);

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("emitHooks", () => {
  it("dispatches even outside a request scope (after() unavailable)", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    const s = await createService({ productId: p.id, name: "API", type: "API" });
    const ev = await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1.0.0" } });
    await prisma.hook.create({ data: { productId: p.id, type: "t-emit", events: ["*"], config: {}, enabled: true } });

    const { delivered } = await emitHooks(ev.id, "deploy.created", "al");
    await delivered;
    expect(await prisma.hookDelivery.count()).toBe(1);
    expect((await prisma.hookDelivery.findFirstOrThrow()).status).toBe("OK");
  });
});
