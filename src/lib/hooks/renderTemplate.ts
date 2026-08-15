import type { HookEvent } from "./types";

export const DEFAULT_SUBJECT = "[{product}/{service}] {kind}";
export const DEFAULT_BODY =
  "{kind} sur {product}/{service} ({environment})\nVersion {version} · statut {status} · par {actor}\n{comment}";

/** Substitute {placeholders}. Unknown placeholders are left as-is; a null/undefined
 *  value renders as an empty string. */
export function renderTemplate(template: string, values: Record<string, string | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key] ?? "") : whole,
  );
}

/** Flatten a HookEvent into the template value map. */
export function templateValues(event: HookEvent): Record<string, string | null | undefined> {
  const d = event.data as { version?: unknown; deployStatus?: unknown; comment?: unknown; fromStatus?: unknown; toStatus?: unknown; actionUrl?: unknown };
  return {
    kind: event.kind,
    company: event.company,
    product: event.product,
    service: event.service,
    environment: event.environment,
    actor: event.actor ?? "",
    version: d.version != null ? String(d.version) : "",
    status: d.deployStatus != null ? String(d.deployStatus) : "",
    comment: d.comment != null ? String(d.comment) : "",
    fromStatus: d.fromStatus != null ? String(d.fromStatus) : "",
    toStatus: d.toStatus != null ? String(d.toStatus) : "",
    actionUrl: d.actionUrl != null ? String(d.actionUrl) : "",
  };
}
