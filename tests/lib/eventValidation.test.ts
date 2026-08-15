import { describe, it, expect } from "vitest";
import {
  validateDeploymentBody,
  validateIncidentBody,
  validateMaintenanceBody,
} from "@/lib/eventValidation";

const ref = { company: "acme", product: "checkout", service: "payment-api", environment: "PROD" };

describe("validateDeploymentBody", () => {
  it("requires a parentId for PRE_MEP/POST_MEP", () => {
    const bad = validateDeploymentBody({ ...ref, requester: "ci", changeType: "PRE_MEP", comment: "c" });
    expect(bad.ok).toBe(false);
    const ok = validateDeploymentBody({ ...ref, requester: "ci", changeType: "POST_MEP", parentId: "evt-123", comment: "c" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.fields.parentId).toBe("evt-123");
  });
  it("makes version optional but comment required for PRE/POST MEP", () => {
    // No version → ok for a phase (with parent + comment).
    const ok = validateDeploymentBody({ ...ref, requester: "ci", changeType: "PRE_MEP", parentId: "p1", comment: "prep" });
    expect(ok.ok).toBe(true);
    if (ok.ok) { expect(ok.value.fields.version).toBe(""); expect(ok.value.fields.comment).toBe("prep"); }
    // No comment → rejected.
    const noComment = validateDeploymentBody({ ...ref, requester: "ci", changeType: "POST_MEP", parentId: "p1" });
    expect(noComment.ok).toBe(false);
    // A normal MEP still requires a version.
    const noVer = validateDeploymentBody({ ...ref, requester: "ci", changeType: "NORMAL" });
    expect(noVer.ok).toBe(false);
  });
  it("accepts a full deployment and defaults deployStatus + occurredAt", () => {
    const r = validateDeploymentBody({ ...ref, version: "1.2.3", requester: "ci", changeType: "NORMAL" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.service).toEqual({ company: "acme", product: "checkout", service: "payment-api" });
      expect(r.value.environment).toBe("PROD");
      expect(r.value.fields.deployStatus).toBe("PENDING");
      expect(r.value.occurredAt).toBeInstanceOf(Date);
    }
  });
  it("accepts an occurredAt with a non-UTC offset and normalizes the instant", () => {
    // 12:00 in Paris (UTC+2 in summer) is 10:00 UTC — the API is not GMT-only.
    const r = validateDeploymentBody({ ...ref, version: "1", requester: "ci", changeType: "NORMAL", occurredAt: "2026-06-25T12:00:00+02:00" });
    expect(r.ok && r.value.occurredAt.toISOString()).toBe("2026-06-25T10:00:00.000Z");
  });
  it("accepts negative offsets too", () => {
    const r = validateDeploymentBody({ ...ref, version: "1", requester: "ci", changeType: "NORMAL", occurredAt: "2026-06-24T22:30:00-05:00" });
    expect(r.ok && r.value.occurredAt.toISOString()).toBe("2026-06-25T03:30:00.000Z");
  });
  it("accepts offsets on scheduledAt as well", () => {
    const r = validateDeploymentBody({
      ...ref, version: "1", requester: "ci", changeType: "NORMAL",
      deployStatus: "SCHEDULED", scheduledAt: "2026-09-01T09:00:00+02:00",
    });
    expect(r.ok && (r.value.fields as { scheduledAt: Date }).scheduledAt.toISOString()).toBe("2026-09-01T07:00:00.000Z");
  });
  it("uses provided occurredAt", () => {
    const r = validateDeploymentBody({ ...ref, version: "1", requester: "ci", changeType: "POSTMEP_SQL", occurredAt: "2026-06-25T10:00:00Z" });
    expect(r.ok && r.value.occurredAt.toISOString()).toBe("2026-06-25T10:00:00.000Z");
  });
  it("rejects a bad changeType", () => {
    const r = validateDeploymentBody({ ...ref, version: "1", requester: "ci", changeType: "WAT" });
    expect(r.ok).toBe(false);
  });
  it("accepts any non-empty environment string — membership is enforced at the persistence boundary, not here", () => {
    const r = validateDeploymentBody({ company: "a", product: "b", service: "c", environment: "STAGING", version: "1", requester: "ci", changeType: "NORMAL" });
    expect(r.ok).toBe(true);
  });
  it("rejects an empty environment", () => {
    const r = validateDeploymentBody({ company: "a", product: "b", service: "c", environment: "", version: "1", requester: "ci", changeType: "NORMAL" });
    expect(r.ok).toBe(false);
  });
  it("rejects missing version", () => {
    const r = validateDeploymentBody({ ...ref, requester: "ci", changeType: "NORMAL" });
    expect(r.ok).toBe(false);
  });
  it("defaults scheduledAt to null when absent", () => {
    const r = validateDeploymentBody({ ...ref, version: "1", requester: "ci", changeType: "NORMAL" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.fields.scheduledAt).toBeNull();
  });
  it("rejects deployStatus SCHEDULED without scheduledAt", () => {
    const r = validateDeploymentBody({ ...ref, version: "1", requester: "ci", changeType: "NORMAL", deployStatus: "SCHEDULED" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/scheduledAt/);
  });
  it("accepts deployStatus SCHEDULED with a valid scheduledAt", () => {
    const r = validateDeploymentBody({
      ...ref,
      version: "1",
      requester: "ci",
      changeType: "NORMAL",
      deployStatus: "SCHEDULED",
      scheduledAt: "2026-07-01T10:00:00Z",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.fields.deployStatus).toBe("SCHEDULED");
      expect(r.value.fields.scheduledAt).toBeInstanceOf(Date);
      expect(r.value.fields.scheduledAt?.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    }
  });
  it("rejects an invalid scheduledAt date", () => {
    const r = validateDeploymentBody({ ...ref, version: "1", requester: "ci", changeType: "NORMAL", scheduledAt: "not-a-date" });
    expect(r.ok).toBe(false);
  });
});

describe("deployment lot default", () => {
  const base = { company: "a", product: "b", service: "c", environment: "PROD", version: "1.2.3", requester: "ci", changeType: "NORMAL" };
  it("defaults lot to the version when absent", () => {
    const v = validateDeploymentBody(base);
    if (!v.ok) throw new Error(v.error);
    expect(v.value.fields.lot).toBe("1.2.3");
  });
  it("keeps an explicit lot", () => {
    const v = validateDeploymentBody({ ...base, lot: "release-2026.07" });
    if (!v.ok) throw new Error(v.error);
    expect(v.value.fields.lot).toBe("release-2026.07");
  });
});

describe("validateIncidentBody", () => {
  it("accepts an incident and sets occurredAt to startedAt", () => {
    const r = validateIncidentBody({ ...ref, incidentType: "outage", startedAt: "2026-06-25T10:00:00Z" });
    expect(r.ok && r.value.occurredAt.toISOString()).toBe("2026-06-25T10:00:00.000Z");
    expect(r.ok && r.value.fields.resolvedAt).toBeNull();
  });
  it("parses resolvedAt when given", () => {
    const r = validateIncidentBody({ ...ref, incidentType: "outage", startedAt: "2026-06-25T10:00:00Z", resolvedAt: "2026-06-25T11:00:00Z" });
    expect(r.ok && r.value.fields.resolvedAt?.toISOString()).toBe("2026-06-25T11:00:00.000Z");
  });
  it("rejects missing startedAt", () => {
    expect(validateIncidentBody({ ...ref, incidentType: "outage" }).ok).toBe(false);
  });
});

describe("validateMaintenanceBody", () => {
  it("accepts a window and sets occurredAt to windowStart", () => {
    const r = validateMaintenanceBody({ ...ref, windowStart: "2026-06-25T10:00:00Z", windowEnd: "2026-06-25T11:00:00Z" });
    expect(r.ok && r.value.occurredAt.toISOString()).toBe("2026-06-25T10:00:00.000Z");
  });
  it("rejects windowEnd before windowStart", () => {
    const r = validateMaintenanceBody({ ...ref, windowStart: "2026-06-25T11:00:00Z", windowEnd: "2026-06-25T10:00:00Z" });
    expect(r.ok).toBe(false);
  });
  it("rejects missing windowEnd", () => {
    expect(validateMaintenanceBody({ ...ref, windowStart: "2026-06-25T10:00:00Z" }).ok).toBe(false);
  });
});
