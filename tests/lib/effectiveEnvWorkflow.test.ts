import { describe, it, expect } from "vitest";
import { effectiveEnvWorkflow } from "@/lib/hierarchy";

describe("effectiveEnvWorkflow", () => {
  const product = { envWorkflow: ["AZER", "PREPROD", "PROD"] };

  it("inherits the product workflow when not overriding", () => {
    expect(effectiveEnvWorkflow({ envWorkflow: ["X"], envWorkflowOverride: false }, product))
      .toEqual(["AZER", "PREPROD", "PROD"]);
  });
  it("uses the service's own workflow when overriding", () => {
    expect(effectiveEnvWorkflow({ envWorkflow: ["DEV", "PROD"], envWorkflowOverride: true }, product))
      .toEqual(["DEV", "PROD"]);
  });
  it("returns an empty workflow when overriding with none", () => {
    expect(effectiveEnvWorkflow({ envWorkflow: [], envWorkflowOverride: true }, product)).toEqual([]);
  });
  it("falls back to empty when there is no product", () => {
    expect(effectiveEnvWorkflow({ envWorkflow: [], envWorkflowOverride: false }, null)).toEqual([]);
  });
});
