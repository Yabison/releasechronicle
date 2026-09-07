import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { GET, PUT } from "@/app/api/v1/public-settings/route";
import { getChangelogVisibility, getPublicEventTypes } from "@/lib/visibility";
import { sessionCookie } from "../setup/session";

let ADMIN: { cookie: string };
beforeEach(async () => { await resetDb(); ADMIN = await sessionCookie(["admin"]); });
afterAll(async () => { await prisma.$disconnect(); });

const put = (body: unknown, headers: HeadersInit = ADMIN) =>
  PUT(new Request("http://x/api/v1/public-settings", {
    method: "PUT",
    headers: { ...(headers as Record<string, string>), "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

describe("PUT /public-settings", () => {
  it("sets the changelog visibility", async () => {
    const res = await put({ changelogVisibility: "PUBLIC" });
    expect(res.status).toBe(200);
    expect(await getChangelogVisibility()).toBe("PUBLIC");
  });

  // Les deux réglages sont indépendants : un PUT qui n'en porte qu'un ne doit pas
  // remettre l'autre à son défaut.
  it("leaves the visibility alone when only the event types are sent", async () => {
    await put({ changelogVisibility: "PUBLIC" });
    await put({ eventTypes: ["DEPLOYMENT"] });
    expect(await getChangelogVisibility()).toBe("PUBLIC");
    expect(await getPublicEventTypes()).toEqual(["DEPLOYMENT"]);
  });

  it("leaves the event types alone when only the visibility is sent", async () => {
    await put({ eventTypes: ["INCIDENT"] });
    await put({ changelogVisibility: "PUBLIC" });
    expect(await getPublicEventTypes()).toEqual(["INCIDENT"]);
  });

  it("refuses an unknown mode without writing anything", async () => {
    const res = await put({ changelogVisibility: "MAYBE" });
    expect(res.status).toBe(400);
    expect(await getChangelogVisibility()).toBe("AUTHENTICATED");
  });

  it("refuses an anonymous caller", async () => {
    const res = await put({ changelogVisibility: "PUBLIC" }, {});
    expect(res.status).toBe(401);
    expect(await getChangelogVisibility()).toBe("AUTHENTICATED");
  });

  it("reports both settings on GET", async () => {
    await put({ changelogVisibility: "PUBLIC" });
    const body = await (await GET()).json();
    expect(body).toMatchObject({ changelogVisibility: "PUBLIC", eventTypes: expect.any(Array) });
  });
});
