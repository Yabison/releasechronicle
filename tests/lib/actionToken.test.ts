import { describe, it, expect } from "vitest";
import { decodeJwt } from "jose";
import { signActionToken, verifyActionToken, actionUrl } from "@/lib/actionToken";

describe("action token", () => {
  it("signs then verifies, preserving eventId + to", async () => {
    const t = await signActionToken({ eventId: "e1", to: "TESTING" });
    expect(await verifyActionToken(t)).toMatchObject({ eventId: "e1", to: "TESTING" });
  });
  it("carries a unique id so a single use can be recorded", async () => {
    const a = await verifyActionToken(await signActionToken({ eventId: "e1", to: "TESTING" }));
    const b = await verifyActionToken(await signActionToken({ eventId: "e1", to: "TESTING" }));
    expect(a!.jti).toBeTruthy();
    expect(a!.jti).not.toBe(b!.jti);
  });
  it("expires in 48h, not a week", async () => {
    const p = decodeJwt(await signActionToken({ eventId: "e1", to: "TESTING" }));
    expect(p.exp! - p.iat!).toBe(48 * 60 * 60);
  });
  it("rejects a token with no id (issued before single-use existed)", async () => {
    const legacy = await signActionToken({ eventId: "e1", to: "TESTING" }, undefined, { omitJti: true });
    expect(await verifyActionToken(legacy)).toBeNull();
  });
  it("rejects tampered + expired", async () => {
    const t = await signActionToken({ eventId: "e1", to: "TESTING" });
    expect(await verifyActionToken(t.slice(0, -2) + "xx")).toBeNull();
    expect(await verifyActionToken(await signActionToken({ eventId: "e1", to: "TESTING" }, -10))).toBeNull();
  });
  it("actionUrl uses APP_BASE_URL", () => {
    process.env.APP_BASE_URL = "https://rc.example";
    expect(actionUrl("TOK")).toBe("https://rc.example/go/TOK");
    delete process.env.APP_BASE_URL;
  });
});
