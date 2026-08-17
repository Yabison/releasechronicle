import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { POST } from "@/app/api/v1/hooks/deliveries/sweep/route";

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
});
