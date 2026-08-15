import { describe, it, expect } from "vitest";
import { register, getConnector } from "@/lib/hooks/registry";
import type { Connector } from "@/lib/hooks/types";

const fake: Connector = { type: "fake", async send() { return { ok: true }; } };

describe("registry", () => {
  it("registers and retrieves a connector by type", () => {
    register(fake);
    expect(getConnector("fake")).toBe(fake);
  });
  it("returns undefined for an unknown type", () => {
    expect(getConnector("nope")).toBeUndefined();
  });
});
