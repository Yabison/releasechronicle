import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HookEvent } from "@/lib/hooks/types";

const sendMail = vi.fn();
let configured = true;
vi.mock("@/lib/mailer", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  isMailerConfigured: () => configured,
}));

import { emailConnector } from "@/lib/hooks/connectors/email";

const event: HookEvent = {
  kind: "deploy.created", occurredAt: "2026-07-01T00:00:00.000Z",
  company: "acme", product: "checkout", service: "api", environment: "PROD",
  actor: "al", data: { version: "2.0.0", deployStatus: "DEPLOYED", comment: null },
};

beforeEach(() => { sendMail.mockReset(); configured = true; });

describe("emailConnector", () => {
  it("sends a rendered mail to the recipients", async () => {
    sendMail.mockResolvedValue(undefined);
    const res = await emailConnector.send(event, { to: ["a@x", "b@x"] });
    expect(res).toEqual({ ok: true });
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toEqual(["a@x", "b@x"]);
    // The subject names the event for a human; the raw kind is an internal
    // identifier and has no business in an inbox.
    expect(arg.subject).toBe("🟠 [checkout/api] Release créée — PROD");
    expect(arg.text).toContain("Version : 2.0.0");
  });
  it("picks the template by event color (incident → red)", async () => {
    sendMail.mockResolvedValue(undefined);
    await emailConnector.send({ ...event, kind: "incident.created" }, { to: ["a@x"] });
    const arg = sendMail.mock.calls[0][0];
    expect(arg.subject).toBe("🔴 [checkout/api] Incident ouvert — PROD");
  });
  it("renders the target's locale when configured", async () => {
    sendMail.mockResolvedValue(undefined);
    await emailConnector.send(event, { to: ["a@x"], locale: "en" });
    // The headline names the event, so the locale shows in the field labels:
    // "Environment:" against the French "Environnement :".
    expect(sendMail.mock.calls[0][0].text).toContain("Release created on");
    expect(sendMail.mock.calls[0][0].text).toContain("Environment:");
  });
  it("errors with no recipients (no send)", async () => {
    const res = await emailConnector.send(event, { to: [] });
    expect(res.ok).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("errors when SMTP is not configured (no send)", async () => {
    configured = false;
    const res = await emailConnector.send(event, { to: ["a@x"] });
    expect(res.ok).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("reports a send failure as an error", async () => {
    sendMail.mockRejectedValue(new Error("smtp down"));
    const res = await emailConnector.send(event, { to: ["a@x"] });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("smtp down");
  });
});
