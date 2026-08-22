import { describe, it, expect } from "vitest";
import { publicEventScopeWhere, type Scope } from "@/lib/apiVisibility";

describe("publicEventScopeWhere", () => {
  it("keeps the deletedAt: null guard on the service for an anonymous caller", () => {
    // publicEventScopeWhere has no caller on this branch (its consumer arrives with
    // the causal-links work), so nothing else would catch a future refactor that
    // drops this guard and lets a soft-deleted service's events leak into a public
    // causal summary. Pin it directly.
    const scope: Scope = { anonymous: true, types: ["DEPLOYMENT"], envs: ["PROD"] };
    const where = publicEventScopeWhere(scope);
    expect(where.service).toMatchObject({ deletedAt: null });
  });
});
