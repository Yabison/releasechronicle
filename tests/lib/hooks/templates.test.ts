import { describe, it, expect } from "vitest";
import { classifyEvent, emailTemplate, teamsTemplate } from "@/lib/hooks/templates";
import type { HookEvent } from "@/lib/hooks/types";

const base: HookEvent = {
  kind: "deploy.created", occurredAt: "2026-08-01T00:00:00.000Z",
  company: "acme", product: "checkout", service: "api", environment: "PROD",
  actor: "al", data: {},
};

describe("classifyEvent", () => {
  it("red for rollback + incident", () => {
    expect(classifyEvent({ ...base, kind: "deploy.rolled_back" })).toBe("red");
    expect(classifyEvent({ ...base, kind: "incident.created" })).toBe("red");
  });
  it("green for a status_changed to VALIDATE", () => {
    expect(classifyEvent({ ...base, kind: "deploy.status_changed", data: { toStatus: "VALIDATE" } })).toBe("green");
  });
  it("orange otherwise (created / in-progress / testing / maintenance)", () => {
    expect(classifyEvent({ ...base, kind: "deploy.created" })).toBe("orange");
    expect(classifyEvent({ ...base, kind: "deploy.status_changed", data: { toStatus: "TESTING" } })).toBe("orange");
    expect(classifyEvent({ ...base, kind: "deploy.status_undone" })).toBe("orange");
    expect(classifyEvent({ ...base, kind: "maintenance.created" })).toBe("orange");
  });
});

describe("templates loaded from config files", () => {
  it("emailTemplate picks the color's subject", () => {
    expect(emailTemplate({ ...base, kind: "incident.created" }).subject).toContain("🔴");
    expect(emailTemplate({ ...base, kind: "deploy.created" }).subject).toContain("🟠");
    expect(emailTemplate({ ...base, kind: "deploy.status_changed", data: { toStatus: "VALIDATE" } }).subject).toContain("🟢");
  });
  it("teamsTemplate picks the color's title", () => {
    expect(teamsTemplate({ ...base, kind: "deploy.rolled_back" }).title).toContain("🔴");
    expect(teamsTemplate({ ...base, kind: "deploy.created" }).title).toContain("🟠");
  });
});

describe("localized templates", () => {
  it("defaults to French", () => {
    expect(emailTemplate({ ...base, kind: "incident.created" }).body).toContain("Incident / rollback sur");
    expect(emailTemplate({ ...base, kind: "deploy.status_changed", data: { toStatus: "VALIDATE" } }).subject).toContain("terminé");
  });
  it("serves the English catalog when asked", () => {
    expect(emailTemplate({ ...base, kind: "incident.created" }, "en").body).toContain("Incident / rollback on");
    expect(emailTemplate({ ...base, kind: "deploy.created" }, "en").body).toContain("Release in progress on");
    expect(emailTemplate({ ...base, kind: "deploy.status_changed", data: { toStatus: "VALIDATE" } }, "en").subject).toContain("done");
    expect(teamsTemplate({ ...base, kind: "deploy.created" }, "en").text).toContain("by {actor}");
  });
  it("falls back to the default locale for an unknown one", () => {
    // @ts-expect-error — deliberately invalid locale, exercised as runtime input
    expect(emailTemplate({ ...base, kind: "incident.created" }, "de").body).toContain("Incident / rollback sur");
  });
});
