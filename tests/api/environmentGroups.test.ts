import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { GET, POST } from "@/app/api/v1/environment-groups/route";
import { PUT, DELETE } from "@/app/api/v1/environment-groups/[id]/route";

let AUTH: { cookie: string };

beforeEach(async () => {
  await resetDb();
  AUTH = await sessionCookie();
  await prisma.environmentConfig.createMany({
    data: [
      { slug: "RUN", name: "RUN", color: "#3b82f6", sortOrder: 0 },
      { slug: "SECURE", name: "SECURE", color: "#8b5cf6", sortOrder: 1 },
      { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 2 },
    ],
  });
});
afterAll(async () => { await prisma.$disconnect(); });

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/v1/environment-groups", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}
function put(id: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://x/api/v1/environment-groups/${id}`, {
    method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("environment-groups API", () => {
  it("rejects create without a token", async () => {
    const res = await POST(post({ name: "ALLPROD", members: ["RUN", "PROD"] }));
    expect(res.status).toBe(401);
  });

  it("creates and lists a group", async () => {
    const res = await POST(post({ name: "ALLPROD", members: ["RUN", "SECURE", "PROD"] }, AUTH));
    expect(res.status).toBe(201);
    const g = await res.json();
    expect(g.slug).toBe("allprod");
    expect(g.members).toEqual(["RUN", "SECURE", "PROD"]);

    const list = await (await GET()).json();
    expect(list).toHaveLength(1);
  });

  it("rejects members that are not valid environments", async () => {
    const res = await POST(post({ name: "Bad", members: ["RUN", "NOPE"] }, AUTH));
    expect(res.status).toBe(400);
  });

  it("rejects an empty member list", async () => {
    const res = await POST(post({ name: "Empty", members: [] }, AUTH));
    expect(res.status).toBe(400);
  });

  it("updates members and deletes a group", async () => {
    const created = await (await POST(post({ name: "ALLPROD", members: ["RUN"] }, AUTH))).json();
    const upd = await PUT(put(created.id, { members: ["RUN", "PROD"] }, AUTH), ctx(created.id));
    expect((await upd.json()).members).toEqual(["RUN", "PROD"]);
    const del = await DELETE(new Request("http://x", { method: "DELETE", headers: AUTH }), ctx(created.id));
    expect(del.status).toBe(200);
    expect(await (await GET()).json()).toHaveLength(0);
  });
});
