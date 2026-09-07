import { describe, it, expect } from "vitest";
import { adaptiveCard } from "@/lib/hooks/connectors/teamsCard";

const EVENT_URL = "https://example.org/acme/checkout/api?event=e1";

const card = (
  title = "Title",
  text = "Body",
  url = "",
  locale: "fr" | "en" = "fr",
  eventUrl = EVENT_URL,
) => adaptiveCard(title, text, "deploy.created", url, eventUrl, locale).attachments[0];

describe("adaptiveCard", () => {
  it("wraps the card in the envelope Power Automate forwards to a channel", () => {
    const payload = adaptiveCard("Title", "Body", "deploy.created", "", EVENT_URL, "fr");
    expect(payload.type).toBe("message");
    expect(payload.attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
    const content = payload.attachments[0].content as { type: string; version: string; body: unknown[] };
    expect(content.type).toBe("AdaptiveCard");
    expect(content.version).toBe("1.4");
    expect(content.body).toHaveLength(2);
  });

  // Without wrap, Teams renders one line and the version, the actor and the
  // comment fall off the right edge.
  it("wraps both text blocks", () => {
    const content = card().content as { body: { wrap?: boolean }[] };
    expect(content.body.every((b) => b.wrap === true)).toBe(true);
  });

  // Teams answers 200 to a card whose title came out empty and posts a blank
  // message: the transport succeeding is exactly when this fails silently.
  it("falls back to the kind rather than posting blank", () => {
    const content = card("", "").content as { body: { text: string }[] };
    expect(content.body[0].text).toBe("deploy.created");
    expect(content.body[1].text).toBe("deploy.created");
  });

  it("turns both links into buttons, the action first", () => {
    const content = card("T", "B", "https://example.org/go/abc").content as {
      actions: { type: string; url: string }[];
    };
    expect(content.actions).toHaveLength(2);
    expect(content.actions[0].type).toBe("Action.OpenUrl");
    expect(content.actions[0].url).toBe("https://example.org/go/abc");
    expect(content.actions[1].url).toBe(EVENT_URL);
  });

  // An incident has no next status, so no action link — but the event link is
  // on every card, which is what stops it being a dead end.
  it("keeps the event button when there is no action", () => {
    const content = card("T", "B", "").content as { actions: { title: string }[] };
    expect(content.actions).toHaveLength(1);
    expect(content.actions[0].title).toBe("Voir l'événement");
  });

  // A button that goes nowhere is worse than no button.
  it("omits the actions entirely when there is no link at all", () => {
    const content = card("T", "B", "", "fr", "").content as { actions?: unknown[] };
    expect(content.actions).toBeUndefined();
  });

  it("labels the button in the target's language", () => {
    const fr = card("T", "B", "https://x/go", "fr").content as { actions: { title: string }[] };
    const en = card("T", "B", "https://x/go", "en").content as { actions: { title: string }[] };
    expect(fr.actions[0].title).toBe("Ouvrir");
    expect(en.actions[0].title).toBe("Open");
  });
});
