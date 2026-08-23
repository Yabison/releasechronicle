import type { HookEvent } from "../types";

/**
 * The two shapes Teams accepts, and why both are here.
 *
 * `messagecard` is the legacy Office 365 connector payload. Microsoft is
 * retiring those connectors, so it cannot be the future — but every webhook URL
 * already configured against one still expects it, and silently switching them
 * would break notifications nobody is watching.
 *
 * `adaptive` is what a Power Automate "when a Teams webhook request is
 * received" flow expects: an Adaptive Card inside an attachments envelope. New
 * integrations should use it.
 *
 * The format is therefore explicit config, defaulting to the legacy shape. An
 * instance that has moved to Power Automate sets `"format": "adaptive"` on the
 * hook; nothing changes underneath anyone who has not.
 */
export type TeamsFormat = "messagecard" | "adaptive";

export const DEFAULT_TEAMS_FORMAT: TeamsFormat = "messagecard";

export function teamsFormat(config: Record<string, unknown>): TeamsFormat {
  return config.format === "adaptive" ? "adaptive" : DEFAULT_TEAMS_FORMAT;
}

export function messageCard(title: string, text: string, kind: string) {
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    summary: title || kind,
    title: title || kind,
    text: text || kind,
  };
}

/**
 * An Adaptive Card 1.4 in the envelope Power Automate forwards to a channel.
 *
 * The body is split into a heading and the text rather than one blob so the
 * card has a visual hierarchy, and `wrap` is set on both: without it Teams
 * truncates to a single line and the version, the actor and the comment
 * disappear off the right edge.
 *
 * `actionUrl` becomes a real button. In a MessageCard it was a URL pasted in
 * the body, which a reader had to notice and copy.
 */
export function adaptiveCard(title: string, text: string, kind: string, actionUrl: string) {
  const body: Record<string, unknown>[] = [
    { type: "TextBlock", text: title || kind, weight: "Bolder", size: "Medium", wrap: true },
    { type: "TextBlock", text: text || kind, wrap: true },
  ];

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          ...(actionUrl
            ? { actions: [{ type: "Action.OpenUrl", title: "Ouvrir / Open", url: actionUrl }] }
            : {}),
        },
      },
    ],
  };
}

/** The payload for this hook's configured format. */
export function teamsPayload(
  event: HookEvent,
  config: Record<string, unknown>,
  title: string,
  text: string,
  actionUrl: string,
): unknown {
  return teamsFormat(config) === "adaptive"
    ? adaptiveCard(title, text, event.kind, actionUrl)
    : messageCard(title, text, event.kind);
}
