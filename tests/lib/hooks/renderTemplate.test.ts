import { describe, it, expect } from "vitest";
import { renderTemplate, templateValues, DEFAULT_SUBJECT, DEFAULT_BODY } from "@/lib/hooks/renderTemplate";
import type { HookEvent } from "@/lib/hooks/types";

const event: HookEvent = {
  kind: "deploy.status_changed", occurredAt: "2026-07-01T00:00:00.000Z",
  company: "acme", product: "checkout", service: "api", environment: "PROD",
  actor: "alice", data: { version: "1.2.3", deployStatus: "DEPLOYED", comment: "ok" },
};

describe("renderTemplate", () => {
  it("substitutes known placeholders", () => {
    expect(renderTemplate("{product}/{service} v{version}", templateValues(event))).toBe("checkout/api v1.2.3");
  });
  it("leaves unknown placeholders and renders null as empty", () => {
    expect(renderTemplate("{nope}-{comment}", { comment: null })).toBe("{nope}-");
  });
  it("renders the default subject", () => {
    expect(renderTemplate(DEFAULT_SUBJECT, templateValues(event))).toBe("[checkout/api] deploy.status_changed");
  });
  it("maps status from deployStatus and actor in the default body", () => {
    const body = renderTemplate(DEFAULT_BODY, templateValues(event));
    expect(body).toContain("statut DEPLOYED");
    expect(body).toContain("par alice");
    expect(body).toContain("Version 1.2.3");
  });
});
