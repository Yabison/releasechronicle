import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { GET } from "@/app/api/v1/directory/route";
import { POST } from "@/app/api/v1/directory/sync/route";

let AUTH: { cookie: string };
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("directory API", () => {
  it("GET without a session is refused (usernames enable enumeration)", async () => {
    expect((await GET(new Request("http://x/api/v1/directory"))).status).toBe(401);
  });
  it("GET lists synced users", async () => {
    await prisma.directoryUser.create({ data: { username: "al", name: "Al", roles: ["qa"] } });
    const list = await (await GET(new Request("http://x/api/v1/directory", { headers: AUTH }))).json();
    expect(list).toHaveLength(1);
    expect(list[0].username).toBe("al");
  });

  it("POST /sync requires the write token", async () => {
    const res = await POST(new Request("http://x/api/v1/directory/sync", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("POST /sync with the token runs (ldap not configured → ok:false, still 200)", async () => {
    // Other integration tests (e.g. ldapSync.test.ts) set these in a beforeAll that may
    // leak across files in the same worker. Delete them all so loadLdapConfig() is
    // deterministically null here, regardless of run order.
    delete process.env.LDAP_URL;
    delete process.env.LDAP_BASE_DN;
    delete process.env.LDAP_BIND_DN;
    delete process.env.LDAP_BIND_PASSWORD;
    const res = await POST(new Request("http://x/api/v1/directory/sync", { method: "POST", headers: { authorization: "Bearer test-token" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
