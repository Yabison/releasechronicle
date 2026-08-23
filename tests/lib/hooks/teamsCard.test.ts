import { describe, it, expect } from "vitest";
import { teamsFormat, messageCard, adaptiveCard, teamsPayload } from "@/lib/hooks/connectors/teamsCard";
import type { HookEvent } from "@/lib/hooks/types";

const event: HookEvent = {
  kind: "deploy.status_changed",
  occurredAt: "2026-08-01T10:00:00.000Z",
  company: "acme", product: "checkout", service: "api", environment: "PROD",
  actor: "bob", data: {},
};

describe("teamsFormat", () => {
  // Every hook configured against an Office 365 connector still expects the
  // legacy shape. Switching them silently would break notifications nobody is
  // watching, which is the worst way to find out.
  it("defaults to the legacy card", () => {
    expect(teamsFormat({})).toBe("messagecard");
    expect(teamsFormat({ format: "messagecard" })).toBe("messagecard");
    expect(teamsFormat({ format: "nonsense" })).toBe("messagecard");
  });

  it("switches only on an explicit opt-in", () => {
    expect(teamsFormat({ format: "adaptive" })).toBe("adaptive");
  });
});

describe("messageCard", () => {
  it("carries the four fields Teams renders", () => {
    const card = messageCard("Title", "Body", "deploy.created");
    expect(card["@type"]).toBe("MessageCard");
    expect(card.summary).toBe("Title");
    expect(card.title).toBe("Title");
    expect(card.text).toBe("Body");
  });

  // Teams answers 200 to a card with an empty title and posts a blank message,
  // so the transport succeeding is exactly when this fails silently.
  it("falls back to the kind rather than posting blank", () => {
    const card = messageCard("", "", "deploy.created");
    expect(card.title).toBe("deploy.created");
    expect(card.text).toBe("deploy.created");
    expect(card.summary).toBe("deploy.created");
  });
});

describe("adaptiveCard", () => {
  it("wraps the card in the envelope Power Automate forwards", () => {
    const payload = adaptiveCard("Title", "Body", "deploy.created", "");
    expect(payload.type).toBe("message");
    expect(payload.attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
    const content = payload.attachments[0].content as { type: string; version: string; body: unknown[] };
    expect(content.type).toBe("AdaptiveCard");
    expect(content.version).toBe("1.4");
    expect(content.body).toHaveLength(2);
  });

  // Without wrap, Teams shows one line and the version, the actor and the
  // comment fall off the right edge.
  it("wraps both text blocks", () => {
    const content = adaptiveCard("Title", "Body", "k", "").attachments[0].content as {
      body: { wrap?: boolean }[];
    };
    expect(content.body.every((b) => b.wrap === true)).toBe(true);
  });

  it("turns the action link into a button, and omits it when there is none", () => {
    const withUrl = adaptiveCard("T", "B", "k", "https://example.org/go/abc")
      .attachments[0].content as { actions?: { type: string; url: string }[] };
    expect(withUrl.actions?.[0].type).toBe("Action.OpenUrl");
    expect(withUrl.actions?.[0].url).toBe("https://example.org/go/abc");

    const without = adaptiveCard("T", "B", "k", "").attachments[0].content as { actions?: unknown[] };
    expect(without.actions).toBeUndefined();
  });
});

describe("teamsPayload", () => {
  it("follows the configured format", () => {
    const legacy = teamsPayload(event, {}, "T", "B", "") as { "@type"?: string };
    expect(legacy["@type"]).toBe("MessageCard");

    const modern = teamsPayload(event, { format: "adaptive" }, "T", "B", "") as { type?: string };
    expect(modern.type).toBe("message");
  });
});
