import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { getChangelogVisibility, setChangelogVisibility, canReadChangelog } from "@/lib/visibility";
import type { SessionUser } from "@/lib/auth/session";

const AUTH: SessionUser = { sub: "u1", name: "Dev", roles: ["devops"] };

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("changelog visibility", () => {
  it("defaults to authenticated-only", async () => {
    expect(await getChangelogVisibility()).toBe("AUTHENTICATED");
    expect(await canReadChangelog(null)).toBe(false);
  });

  it("lets a signed-in user read it whatever the mode", async () => {
    expect(await canReadChangelog(AUTH)).toBe(true);
    await setChangelogVisibility("PUBLIC");
    expect(await canReadChangelog(AUTH)).toBe(true);
  });

  it("opens it to anonymous readers in PUBLIC mode", async () => {
    await setChangelogVisibility("PUBLIC");
    expect(await canReadChangelog(null)).toBe(true);
  });

  it("refuses an unknown mode rather than storing it", async () => {
    await expect(setChangelogVisibility("MAYBE" as never)).rejects.toThrow();
    expect(await getChangelogVisibility()).toBe("AUTHENTICATED");
  });

  it("leaves the public event types alone when only the mode changes", async () => {
    const { setPublicEventTypes, getPublicEventTypes } = await import("@/lib/visibility");
    await setPublicEventTypes(["DEPLOYMENT"]);
    await setChangelogVisibility("PUBLIC");
    expect(await getPublicEventTypes()).toEqual(["DEPLOYMENT"]);
  });
});
