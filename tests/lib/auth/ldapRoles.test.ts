import { describe, it, expect } from "vitest";
import { mapGroupsToRoles } from "@/lib/auth/ldapRoles";

const map = { admins: "admin", "devops-team": "devops", "qa-team": "qa", everyone: "viewer" };

describe("mapGroupsToRoles", () => {
  it("maps known CNs to roles", () => {
    expect(mapGroupsToRoles(["qa-team"], map)).toEqual(["qa"]);
    expect(mapGroupsToRoles(["devops-team", "qa-team"], map).sort()).toEqual(["devops", "qa"]);
  });
  it("drops unknown groups + unknown roles, dedupes", () => {
    expect(mapGroupsToRoles(["nope", "qa-team", "qa-team"], map)).toEqual(["qa"]);
    expect(mapGroupsToRoles(["ghost"], { ghost: "wizard" })).toEqual([]);
  });
  it("empty → []", () => expect(mapGroupsToRoles([], map)).toEqual([]));
});
