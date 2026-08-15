import { describe, it, expect } from "vitest";
import { envStepStates } from "@/lib/envWorkflow";

const wf = ["DEV", "QA", "PROD"];

describe("envStepStates", () => {
  it("splits done / current / upcoming around current", () => {
    const rows = envStepStates(wf, "QA");
    expect(rows).toEqual([
      { env: "DEV", state: "done" },
      { env: "QA", state: "current" },
      { env: "PROD", state: "upcoming" },
    ]);
  });
  it("all upcoming when current is not in the workflow", () => {
    const rows = envStepStates(wf, "SECURE");
    expect(rows.every((r) => r.state === "upcoming")).toBe(true);
  });
  it("empty workflow → empty array", () => {
    expect(envStepStates([], "PROD")).toEqual([]);
  });
});
