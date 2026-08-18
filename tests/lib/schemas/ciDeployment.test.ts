import { describe, it, expect } from "vitest";
import { ciDeploymentBodySchema } from "@/lib/schemas/ciDeployment";
import { deploymentBodySchema } from "@/lib/schemas/event";

describe("ciDeploymentBodySchema", () => {
  it("applies the CI defaults", () => {
    const v = ciDeploymentBodySchema.parse({ version: "2.0.0" });
    expect(v.fields).toMatchObject({
      version: "2.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED",
      lot: "2.0.0", comment: null, externalLink: null, scheduledAt: null,
    });
  });
  it("requires version", () => {
    expect(ciDeploymentBodySchema.safeParse({}).success).toBe(false);
  });
  it("rejects a non-string environment (String() coercion is gone)", () => {
    expect(ciDeploymentBodySchema.safeParse({ version: "1", environment: 42 }).success).toBe(false);
  });
  it("requires scheduledAt when deployStatus is SCHEDULED", () => {
    expect(ciDeploymentBodySchema.safeParse({ version: "1", deployStatus: "SCHEDULED" }).success).toBe(false);
    expect(ciDeploymentBodySchema.safeParse({ version: "1", deployStatus: "SCHEDULED", scheduledAt: "2026-09-01T08:00:00Z" }).success).toBe(true);
  });
});

describe("REST vs CI divergence (locked contract)", () => {
  const envelope = { company: "acme", product: "checkout", service: "api", environment: "PROD" };
  it("each path keeps its own defaults", () => {
    const rest = deploymentBodySchema.parse({ ...envelope, version: "1.0.0", requester: "alice", changeType: "HOTFIX" });
    const ci = ciDeploymentBodySchema.parse({ version: "1.0.0" });
    // requester: REST requires it; CI defaults to "ci"
    expect(rest.fields.requester).toBe("alice");
    expect(ci.fields.requester).toBe("ci");
    // deployStatus: REST → PENDING, CI → DEPLOYED
    expect(rest.fields.deployStatus).toBe("PENDING");
    expect(ci.fields.deployStatus).toBe("DEPLOYED");
    // changeType: REST requires it; CI defaults to NORMAL
    expect(deploymentBodySchema.safeParse({ ...envelope, version: "1", requester: "a" }).success).toBe(false);
    expect(ci.fields.changeType).toBe("NORMAL");
    // lot ← version on both when absent
    expect(rest.fields.lot).toBe("1.0.0");
    expect(ci.fields.lot).toBe("1.0.0");
  });

  // This test exists to freeze the exact field SET each schema produces, not just
  // the defaults that differ. Two independently-written field lists are how the
  // original REST and CI validators drifted apart in the first place — any field
  // added to either schema's output tomorrow must fail one of these assertions
  // and force a conscious decision about whether the other side needs it too.
  it("locks the exact field set of each schema, including the fields each side lacks", () => {
    const rest = deploymentBodySchema.parse({ ...envelope, version: "1.0.0", requester: "alice", changeType: "HOTFIX" });
    const ci = ciDeploymentBodySchema.parse({ version: "1.0.0" });

    expect(Object.keys(ci.fields).sort()).toEqual([
      "changeType", "comment", "deployStatus", "externalLink", "lot", "requester", "scheduledAt", "version",
    ]);
    expect(Object.keys(rest.fields).sort()).toEqual([
      "changeType", "comment", "deployStatus", "externalLink", "hourType", "lot", "parentId", "requester", "scheduledAt", "version",
    ]);
    // REST carries parentId/hourType; CI has neither.
    expect(Object.keys(rest.fields).filter((k) => !(k in ci.fields)).sort()).toEqual(["hourType", "parentId"]);

    // occurredAt: REST always stamps a Date (defaulting to now when absent);
    // the CI schema's output has no occurredAt at all — the CI route stamps it.
    expect(rest.occurredAt).toBeInstanceOf(Date);
    expect("occurredAt" in ci).toBe(false);

    // environment: required on REST (a body without it fails); optional on CI
    // (a body without it parses — the DB-backed fallback lives in ingestDeployment.ts).
    const { environment: _environment, ...envelopeWithoutEnv } = envelope;
    expect(deploymentBodySchema.safeParse({ ...envelopeWithoutEnv, version: "1", requester: "a", changeType: "NORMAL" }).success).toBe(false);
    expect(ciDeploymentBodySchema.safeParse({ version: "1" }).success).toBe(true);
  });
});
