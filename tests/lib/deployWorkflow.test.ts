import { describe, it, expect } from "vitest";
import { DeployStatus } from "@prisma/client";
import {
  DEPLOY_ORDER,
  nextStatus,
  previousStatus,
  canTransition,
  commentRequired,
  roleGroup,
} from "@/lib/deployWorkflow";

const { SCHEDULED, PENDING, GO_CONFIRMED, IN_PROGRESS, DEPLOYED, TESTING, VALIDATE } = DeployStatus;

describe("DEPLOY_ORDER", () => {
  it("is the canonical forward sequence", () => {
    expect(DEPLOY_ORDER).toEqual([
      SCHEDULED,
      GO_CONFIRMED,
      PENDING,
      IN_PROGRESS,
      DEPLOYED,
      TESTING,
      VALIDATE,
    ]);
  });
  it("starts with SCHEDULED", () => {
    expect(DEPLOY_ORDER[0]).toBe("SCHEDULED");
  });
});

describe("nextStatus", () => {
  it("returns the following status", () => {
    expect(nextStatus(SCHEDULED)).toBe(GO_CONFIRMED);
    expect(nextStatus(GO_CONFIRMED)).toBe(PENDING);
    expect(nextStatus(PENDING)).toBe(IN_PROGRESS);
    expect(nextStatus(DEPLOYED)).toBe(TESTING);
  });
  it("returns null at the end", () => {
    expect(nextStatus(VALIDATE)).toBeNull();
  });
});

describe("previousStatus", () => {
  it("returns the preceding status", () => {
    expect(previousStatus(GO_CONFIRMED)).toBe(SCHEDULED);
    expect(previousStatus(PENDING)).toBe(GO_CONFIRMED);
    expect(previousStatus(IN_PROGRESS)).toBe(PENDING);
    expect(previousStatus(VALIDATE)).toBe(TESTING);
  });
  it("returns null at the start", () => {
    expect(previousStatus(SCHEDULED)).toBeNull();
  });
});

describe("canTransition", () => {
  it("allows exactly one forward step", () => {
    expect(canTransition(SCHEDULED, GO_CONFIRMED)).toBe(true);
    expect(canTransition(GO_CONFIRMED, PENDING)).toBe(true);
    expect(canTransition(PENDING, IN_PROGRESS)).toBe(true);
    expect(canTransition(DEPLOYED, TESTING)).toBe(true);
  });
  it("rejects skipping a step", () => {
    expect(canTransition(PENDING, DEPLOYED)).toBe(false);
  });
  it("rejects going backward", () => {
    expect(canTransition(TESTING, DEPLOYED)).toBe(false);
  });
  it("rejects staying on the same status", () => {
    expect(canTransition(DEPLOYED, DEPLOYED)).toBe(false);
  });
  it("rejects any move out of VALIDATE", () => {
    expect(canTransition(VALIDATE, VALIDATE)).toBe(false);
  });
});

describe("commentRequired", () => {
  it("is true only for VALIDATE", () => {
    expect(commentRequired(VALIDATE)).toBe(true);
    expect(commentRequired(DEPLOYED)).toBe(false);
    expect(commentRequired(PENDING)).toBe(false);
  });
});

describe("roleGroup", () => {
  it("groups devops and qa statuses", () => {
    expect(roleGroup(SCHEDULED)).toBe("devops");
    expect(roleGroup(PENDING)).toBe("devops");
    expect(roleGroup(GO_CONFIRMED)).toBe("devops");
    expect(roleGroup(IN_PROGRESS)).toBe("devops");
    expect(roleGroup(DEPLOYED)).toBe("devops");
    expect(roleGroup(TESTING)).toBe("qa");
    expect(roleGroup(VALIDATE)).toBe("qa");
  });
});
