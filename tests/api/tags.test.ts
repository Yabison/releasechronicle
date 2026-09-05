import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { GET, POST, PUT, DELETE } from "@/app/api/v1/tags/route";

let AUTH: { cookie: string };
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });

const req = (method: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api/v1/tags", { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

/** DELETE request with an explicit URL (for query-string cases) and an optional body (omit for "no body"). */
const delReq = (url: string, body: unknown | undefined, headers: Record<string, string> = {}) =>
  body === undefined
    ? new Request(url, { method: "DELETE", headers })
    : new Request(url, { method: "DELETE", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function deployWithTags(tags: string[]) {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags,
    fields: { version: "1", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: null } });
}

describe("tags API (union of event-used and configured)", () => {
  it("lists event tags even without a config, plus their usage count", async () => {
    await deployWithTags(["rollback", "canary"]);
    await POST(req("POST", { name: "prod", color: "#112233" }, AUTH)); // configured but unused
    const all = await (await GET()).json();
    const byName = Object.fromEntries(all.map((t: { name: string }) => [t.name, t]));
    expect(byName.rollback).toMatchObject({ color: null, count: 1 });
    expect(byName.canary.count).toBe(1);
    expect(byName.prod).toMatchObject({ color: "#112233", count: 0 });
  });

  it("sets a colour on an event-only tag", async () => {
    await deployWithTags(["canary"]);
    expect((await POST(req("POST", { name: "canary", color: "#10b981" }, AUTH))).status).toBe(200);
    const byName = Object.fromEntries((await (await GET()).json()).map((t: { name: string }) => [t.name, t]));
    expect(byName.canary.color).toBe("#10b981");
  });

  it("renames a tag across events", async () => {
    const ev = await deployWithTags(["canari"]);
    await PUT(req("PUT", { name: "canari", newName: "canary" }, AUTH));
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.tags).toEqual(["canary"]);
  });

  it("deletes a tag everywhere", async () => {
    const ev = await deployWithTags(["temp", "keep"]);
    await DELETE(req("DELETE", { name: "temp" }, AUTH));
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.tags).toEqual(["keep"]);
  });

  it("DELETE: a body name (even blank) wins over the query fallback, and 400s when blank", async () => {
    const ev = await deployWithTags(["foo"]);
    const res = await DELETE(delReq("http://x/api/v1/tags?name=foo", { name: "" }, AUTH));
    expect(res.status).toBe(400);
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.tags).toEqual(["foo"]);
  });

  it("DELETE: rejects a whitespace-only body name with no query present", async () => {
    const res = await DELETE(delReq("http://x/api/v1/tags", { name: "  " }, AUTH));
    expect(res.status).toBe(400);
  });

  it("DELETE: falls back to the query string when the body has no name", async () => {
    const ev = await deployWithTags(["foo"]);
    const res = await DELETE(delReq("http://x/api/v1/tags?name=foo", undefined, AUTH));
    expect(res.status).toBe(200);
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.tags).toEqual([]);
  });

  it("DELETE: deletes via a plain body name", async () => {
    const ev = await deployWithTags(["foo"]);
    const res = await DELETE(delReq("http://x/api/v1/tags", { name: "foo" }, AUTH));
    expect(res.status).toBe(200);
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.tags).toEqual([]);
  });

  it("rejects mutations without a token", async () => {
    expect((await POST(req("POST", { name: "x", color: "#000000" }))).status).toBe(401);
    expect((await DELETE(req("DELETE", { name: "x" }))).status).toBe(401);
  });
});
