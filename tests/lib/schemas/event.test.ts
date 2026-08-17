import { describe, it, expect } from "vitest";
import { deploymentBodySchema, incidentBodySchema, maintenanceBodySchema } from "@/lib/schemas/event";

const envelope = { company: "acme", product: "checkout", service: "api", environment: "PROD" };
const deploy = (over: Record<string, unknown> = {}) => ({
  ...envelope, version: "1.0.0", requester: "alice", changeType: "NORMAL", ...over,
});

describe("deploymentBodySchema", () => {
  it("produces the persisted shape with REST defaults", () => {
    const v = deploymentBodySchema.parse(deploy());
    expect(v.service).toEqual({ company: "acme", product: "checkout", service: "api" });
    expect(v.fields).toMatchObject({
      version: "1.0.0", requester: "alice", changeType: "NORMAL",
      deployStatus: "PENDING", lot: "1.0.0", comment: null, externalLink: null,
      scheduledAt: null, parentId: null, hourType: null,
    });
    expect(v.occurredAt).toBeInstanceOf(Date);
  });
  it("requires the envelope slugs and environment", () => {
    expect(deploymentBodySchema.safeParse({ ...deploy(), company: " " }).success).toBe(false);
    expect(deploymentBodySchema.safeParse({ ...deploy(), environment: undefined }).success).toBe(false);
  });
  it("requires version except for PRE/POST_MEP phases", () => {
    expect(deploymentBodySchema.safeParse(deploy({ version: undefined })).success).toBe(false);
    const phase = deploy({ version: undefined, changeType: "PRE_MEP", parentId: "p1", comment: "prep" });
    expect(deploymentBodySchema.safeParse(phase).success).toBe(true);
    expect(deploymentBodySchema.parse(phase).fields.version).toBe("");
  });
  it("requires parentId AND comment for phases", () => {
    expect(deploymentBodySchema.safeParse(deploy({ changeType: "POST_MEP", comment: "c" })).success).toBe(false);
    expect(deploymentBodySchema.safeParse(deploy({ changeType: "POST_MEP", parentId: "p" })).success).toBe(false);
  });
  it("requires scheduledAt when deployStatus is SCHEDULED", () => {
    expect(deploymentBodySchema.safeParse(deploy({ deployStatus: "SCHEDULED" })).success).toBe(false);
    expect(deploymentBodySchema.safeParse(deploy({ deployStatus: "SCHEDULED", scheduledAt: "2026-09-01T08:00:00Z" })).success).toBe(true);
  });
  it("defaults lot to version, keeps an explicit lot, rejects a bad occurredAt", () => {
    expect(deploymentBodySchema.parse(deploy({ lot: "L1" })).fields.lot).toBe("L1");
    expect(deploymentBodySchema.safeParse(deploy({ occurredAt: "not-a-date" })).success).toBe(false);
  });
  it("keeps hourType only when HO/HNO, never rejects it", () => {
    expect(deploymentBodySchema.parse(deploy({ hourType: "HNO" })).fields.hourType).toBe("HNO");
    expect(deploymentBodySchema.parse(deploy({ hourType: "whatever" })).fields.hourType).toBeNull();
  });
});

describe("incidentBodySchema", () => {
  const incident = (over: Record<string, unknown> = {}) => ({ ...envelope, incidentType: "outage", startedAt: "2026-06-25T10:00:00Z", ...over });
  it("derives occurredAt and the status default", () => {
    const open = incidentBodySchema.parse(incident());
    expect(open.occurredAt).toEqual(new Date("2026-06-25T10:00:00Z"));
    expect(open.fields.incidentStatus).toBe("INVESTIGATING");
    const closed = incidentBodySchema.parse(incident({ resolvedAt: "2026-06-25T11:00:00Z" }));
    expect(closed.fields.incidentStatus).toBe("RESOLVED");
  });
  it("honors an explicit incidentStatus and rejects unknown ones", () => {
    expect(incidentBodySchema.parse(incident({ incidentStatus: "MONITORING" })).fields.incidentStatus).toBe("MONITORING");
    expect(incidentBodySchema.safeParse(incident({ incidentStatus: "NOPE" })).success).toBe(false);
  });
  it("requires incidentType and a valid startedAt", () => {
    expect(incidentBodySchema.safeParse(incident({ incidentType: " " })).success).toBe(false);
    expect(incidentBodySchema.safeParse(incident({ startedAt: "bogus" })).success).toBe(false);
  });
});

describe("maintenanceBodySchema", () => {
  const maint = (over: Record<string, unknown> = {}) => ({ ...envelope, windowStart: "2026-06-25T08:00:00Z", windowEnd: "2026-06-25T09:00:00Z", ...over });
  it("derives occurredAt from windowStart and nulls the version", () => {
    const v = maintenanceBodySchema.parse(maint());
    expect(v.occurredAt).toEqual(new Date("2026-06-25T08:00:00Z"));
    expect(v.fields.version).toBeNull();
  });
  it("allows an equal window, rejects an inverted one", () => {
    expect(maintenanceBodySchema.safeParse(maint({ windowEnd: "2026-06-25T08:00:00Z" })).success).toBe(true);
    expect(maintenanceBodySchema.safeParse(maint({ windowEnd: "2026-06-25T07:00:00Z" })).success).toBe(false);
  });
});
