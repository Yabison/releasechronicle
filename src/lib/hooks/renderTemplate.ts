import type { HookEvent } from "./types";
import { getMessages, translate, DEFAULT_LOCALE, type Locale } from "@/i18n";

export const DEFAULT_SUBJECT = "[{product}/{service}] {kind}";
export const DEFAULT_BODY =
  "{kind} sur {product}/{service} ({environment})\nVersion {version} · statut {status} · par {actor}\n{comment}";

/** Substitute {placeholders}. Unknown placeholders are left as-is; a null/undefined
 *  value renders as an empty string. */
export function renderTemplate(template: string, values: Record<string, string | null | undefined>): string {
  const filled = template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key] ?? "") : whole,
  );
  return pruneEmptyLines(filled);
}

/**
 * Drops the lines a template wrote for a field this event does not have.
 *
 * A template that lists every field is only usable if it stays quiet about the
 * ones that are empty: without this, a release notification says
 * "Type d'incident :" followed by nothing, and a maintenance says "Version :".
 *
 * A line goes only when everything after its label is gone — label, colon,
 * arrows and separators removed, nothing left. A line with no colon is content,
 * not a field, and is always kept.
 */
export function pruneEmptyLines(text: string): string {
  const kept = text.split("\n").filter((line) => {
    const colon = line.indexOf(":");
    if (colon === -1) return true;
    // A URL ("Action : https://…") has a colon in its value, not its label.
    const label = line.slice(0, colon);
    if (label.length > 40 || label.includes("http")) return true;
    const rest = line.slice(colon + 1).replace(/[→\-–—·|,;\s]/g, "");
    return rest.length > 0;
  });
  // Pruning can leave a run of blank lines where a block used to be.
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** Flatten a HookEvent into the template value map.
 *
 *  Everything the dispatcher puts on the event is exposed, not a subset: a
 *  template that cannot reach scheduledAt or incidentType forces the reader to
 *  open the app to learn what the message was about.
 *
 *  Three of these are computed rather than copied, because the raw fields read
 *  badly on their own:
 *
 *  - `transition` is "A → B", or empty when there is no transition. Templates
 *    used to write "{fromStatus} → {toStatus}" and a creation rendered as a
 *    bare arrow between two blanks.
 *  - `kindLabel` is the sentence a human reads. `kind` stays available, but a
 *    subject line saying "deploy.status_changed" is an internal identifier
 *    shown to a recipient.
 *  - `when` is the event time, formatted rather than an ISO string.
 */
export function templateValues(
  event: HookEvent,
  locale: Locale = DEFAULT_LOCALE,
): Record<string, string | null | undefined> {
  const d = event.data as {
    eventId?: unknown; type?: unknown; version?: unknown; deployStatus?: unknown;
    comment?: unknown; fromStatus?: unknown; toStatus?: unknown; actionUrl?: unknown;
    scheduledAt?: unknown; windowStart?: unknown; windowEnd?: unknown; incidentType?: unknown;
  };
  const str = (v: unknown) => (v != null ? String(v) : "");
  const from = str(d.fromStatus);
  const to = str(d.toStatus);
  const messages = getMessages(locale);

  return {
    // identity
    kind: event.kind,
    kindLabel: translate(messages, `hookKind.${event.kind}`),
    eventId: str(d.eventId),
    type: str(d.type),
    // where
    company: event.company,
    product: event.product,
    service: event.service,
    environment: event.environment,
    // who and when
    actor: event.actor ?? "",
    occurredAt: event.occurredAt,
    when: formatStamp(event.occurredAt, locale),
    // deployment
    version: str(d.version),
    status: str(d.deployStatus),
    fromStatus: from,
    toStatus: to,
    transition: from && to ? `${from} → ${to}` : "",
    // incident and maintenance
    incidentType: str(d.incidentType),
    scheduledAt: formatStamp(str(d.scheduledAt), locale),
    windowStart: formatStamp(str(d.windowStart), locale),
    windowEnd: formatStamp(str(d.windowEnd), locale),
    // free text and the one-click link
    comment: str(d.comment),
    actionUrl: str(d.actionUrl),
  };
}

/** Readable, timezone-explicit, and empty for an absent date rather than
 *  "Invalid Date". Notifications leave the app, so they carry UTC: the reader's
 *  timezone is unknown and a bare local time would be a guess. */
function formatStamp(iso: string, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", {
    timeZone: "UTC", dateStyle: "short", timeStyle: "short",
  })} UTC`;
}
