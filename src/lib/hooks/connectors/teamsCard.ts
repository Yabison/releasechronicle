import { getMessages, translate, type Locale } from "@/i18n";

/**
 * The Adaptive Card Teams receives, in the envelope a Power Automate
 * "when a Teams webhook request is received" flow forwards to a channel.
 *
 * There is only one shape here on purpose. The legacy Office 365 MessageCard
 * was the other candidate, but Microsoft is retiring the connectors that
 * consume it, and this instance has no hook configured against one — so
 * carrying both would have meant maintaining a dead path and a config flag to
 * choose it.
 */
export function adaptiveCard(
  title: string,
  text: string,
  fallback: string,
  actionUrl: string,
  eventUrl: string,
  locale: Locale,
) {
  // wrap on both blocks: without it Teams renders a single line and the
  // version, the actor and the comment fall off the right edge.
  const body = [
    { type: "TextBlock", text: title || fallback, weight: "Bolder", size: "Medium", wrap: true },
    { type: "TextBlock", text: text || fallback, wrap: true },
  ];

  const messages = getMessages(locale);
  const actions = [
    actionUrl ? { type: "Action.OpenUrl", title: translate(messages, "hook.openAction"), url: actionUrl } : null,
    eventUrl ? { type: "Action.OpenUrl", title: translate(messages, "hook.seeEvent"), url: eventUrl } : null,
  ].filter((a): a is { type: string; title: string; url: string } => a !== null);

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          // An identifier rather than a URL Teams fetches, but https costs nothing.
          $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          // Buttons, not URLs pasted mid-sentence for the reader to notice and
          // copy. The action exists only on a deployment with a next status;
          // the event link is on every card, so an incident is no longer a dead
          // end. A link that is absent yields no button rather than one that
          // goes nowhere.
          ...(actions.length ? { actions } : {}),
        },
      },
    ],
  };
}
