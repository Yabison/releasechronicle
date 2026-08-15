import { describe, it, expect } from "vitest";
import { DeployStatus } from "@prisma/client";
import { stepStates } from "@/lib/deployTimeline";

const stateOf = (rows: ReturnType<typeof stepStates>, s: DeployStatus) =>
  rows.find((r) => r.status === s)!.state;

describe("stepStates", () => {
  it("covers all statuses in order", () => {
    const rows = stepStates(DeployStatus.DEPLOYED);
    expect(rows.map((r) => r.status)).toEqual([
      DeployStatus.SCHEDULED,
      DeployStatus.GO_CONFIRMED,
      DeployStatus.PENDING,
      DeployStatus.IN_PROGRESS,
      DeployStatus.DEPLOYED,
      DeployStatus.TESTING,
      DeployStatus.VALIDATE,
    ]);
  });

  it("null current → SCHEDULED is next, rest (including PENDING) future", () => {
    const rows = stepStates(null);
    expect(stateOf(rows, DeployStatus.SCHEDULED)).toBe("next");
    expect(stateOf(rows, DeployStatus.PENDING)).toBe("future");
    expect(stateOf(rows, DeployStatus.IN_PROGRESS)).toBe("future");
    expect(stateOf(rows, DeployStatus.VALIDATE)).toBe("future");
    expect(rows.some((r) => r.state === "done" || r.state === "current")).toBe(
      false,
    );
  });

  it("DEPLOYED current → past done, DEPLOYED current, TESTING next, VALIDATE future", () => {
    const rows = stepStates(DeployStatus.DEPLOYED);
    expect(stateOf(rows, DeployStatus.SCHEDULED)).toBe("done");
    expect(stateOf(rows, DeployStatus.PENDING)).toBe("done");
    expect(stateOf(rows, DeployStatus.IN_PROGRESS)).toBe("done");
    expect(stateOf(rows, DeployStatus.DEPLOYED)).toBe("current");
    expect(stateOf(rows, DeployStatus.TESTING)).toBe("next");
    expect(stateOf(rows, DeployStatus.VALIDATE)).toBe("future");
  });

  it("VALIDATE current → all done except VALIDATE current, no next", () => {
    const rows = stepStates(DeployStatus.VALIDATE);
    expect(stateOf(rows, DeployStatus.PENDING)).toBe("done");
    expect(stateOf(rows, DeployStatus.TESTING)).toBe("done");
    expect(stateOf(rows, DeployStatus.VALIDATE)).toBe("current");
    expect(rows.some((r) => r.state === "next")).toBe(false);
  });
});
