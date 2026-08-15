import { describe, it, expect } from "vitest";
import { signSession } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/guard";

async function reqWith(cookie?: string) {
  return new Request("http://x/api/v1/companies", { method: "POST", headers: cookie ? { cookie } : {} });
}

describe("requireAdmin", () => {
  it("401 without a session", async () => {
    expect((await requireAdmin(await reqWith()))?.status).toBe(401);
  });
  it("403 for a non-admin session", async () => {
    const t = await signSession({ sub: "v", name: "V", roles: ["viewer"] });
    expect((await requireAdmin(await reqWith(`rc_session=${t}`)))?.status).toBe(403);
  });
  it("allows an admin session (null)", async () => {
    const t = await signSession({ sub: "a", name: "A", roles: ["admin"] });
    expect(await requireAdmin(await reqWith(`rc_session=${t}`))).toBeNull();
  });
});
