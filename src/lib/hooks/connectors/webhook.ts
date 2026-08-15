import type { Connector, ConnectorResult, HookEvent } from "../types";
import { checkConfiguredOutboundUrl } from "@/lib/outboundUrl";

const TIMEOUT_MS = 5000;

export const webhookConnector: Connector = {
  type: "webhook",
  async send(event: HookEvent, config: Record<string, unknown>): Promise<ConnectorResult> {
    const raw = typeof config.url === "string" ? config.url : "";
    if (!raw) return { ok: false, error: "webhook url is required" };
    // Re-checked at send time, not just at creation: a target saved before the
    // policy tightened would otherwise keep firing.
    const checked = checkConfiguredOutboundUrl(raw);
    if (!checked.ok) return { ok: false, error: checked.reason };
    const url = checked.url;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(config.headers && typeof config.headers === "object" ? (config.headers as Record<string, string>) : {}),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // `manual`: a 302 to 169.254.169.254 would otherwise walk straight past the check.
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(event), signal: controller.signal, redirect: "manual" });
      return { ok: res.ok, statusCode: res.status };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "request failed" };
    } finally {
      clearTimeout(timer);
    }
  },
};
