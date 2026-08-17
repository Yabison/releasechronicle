import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { POST } from "@/app/api/v1/hooks/deliveries/sweep/route";
import { createCompany, createProduct } from "@/lib/hierarchy";

const AUTH = { authorization: "Bearer test-token" };
const req = (h: Record<string, string> = {}) => new Request("http://x/api/v1/hooks/deliveries/sweep", { method: "POST", headers: h });

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("POST /api/v1/hooks/deliveries/sweep", () => {
  it("requires the write token", async () => {
    expect((await POST(req())).status).toBe(401);
  });
  it("returns the sweep counters", async () => {
    const res = await POST(req(AUTH));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ retried: 0, purged: 0 });
  });

  // Regression for a fresh process (e.g. the sweep route or instrumentation.ts)
  // reaching the sweeper without the connector registry ever having been
  // populated: every due row would be permanently dead-lettered with
  // "unknown connector: webhook" instead of actually being retried. This test
  // deliberately avoids importing "@/lib/hooks" (or anything that does)
  // itself, so registration must come from the sweep code path under test.
  it("retries a due delivery through a real connector even when nothing else registered one", async () => {
    const company = await createCompany({ name: "Acme" });
    const product = await createProduct({ companyId: company.id, name: "Checkout" });
    const hook = await prisma.hook.create({
      data: { productId: product.id, type: "webhook", events: ["*"], config: { url: "http://127.0.0.1:9/unreachable" } },
    });
    const delivery = await prisma.hookDelivery.create({
      data: {
        hookId: hook.id,
        kind: "deploy.created",
        status: "FAILED",
        attempts: 1,
        nextAttemptAt: new Date(Date.now() - 1000),
        payload: {
          kind: "deploy.created",
          occurredAt: new Date().toISOString(),
          company: company.slug,
          product: product.slug,
          service: "api",
          environment: "PROD",
          actor: null,
          data: {},
        },
      },
    });

    const res = await POST(req(AUTH));
    expect(res.status).toBe(200);

    const row = await prisma.hookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(row.status).not.toBe("DEAD");
    expect(row.error ?? "").not.toContain("unknown connector");
  });
});
