import type { Connector, ConnectorResult, HookEvent } from "../types";
import { renderTemplate, templateValues } from "../renderTemplate";
import { teamsTemplate, templateLocale } from "../templates";
import { checkConfiguredOutboundUrl } from "@/lib/outboundUrl";

const TIMEOUT_MS = 5000;

function messageCard(event: HookEvent, config: Record<string, unknown>) {
  const locale = templateLocale(config);
  const values = templateValues(event, locale);
  const tpl = teamsTemplate(event, locale);
  const title = renderTemplate(tpl.title, values);
  const text = renderTemplate(tpl.text, values);
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    summary: title || event.kind,
    title: title || event.kind,
    text: text || event.kind,
  };
}

export const teamsConnector: Connector = {
  type: "teams",
  async send(event: HookEvent, config: Record<string, unknown>): Promise<ConnectorResult> {
    const raw = typeof config.url === "string" ? config.url : "";
    if (!raw) return { ok: false, error: "teams webhook url is required" };
    const checked = checkConfiguredOutboundUrl(raw);
    if (!checked.ok) return { ok: false, error: checked.reason };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(checked.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(messageCard(event, config)),
        signal: controller.signal,
        redirect: "manual",
      });
      return { ok: res.ok, statusCode: res.status };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "request failed" };
    } finally {
      clearTimeout(timer);
    }
  },
};
