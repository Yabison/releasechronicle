import type { Connector, ConnectorResult, HookEvent } from "../types";
import { renderTemplate, templateValues } from "../renderTemplate";
import { emailTemplate, templateLocale } from "../templates";
import { sendMail, isMailerConfigured } from "@/lib/mailer";
import { emailHtml } from "./emailHtml";
import { getMessages, translate } from "@/i18n";

export const emailConnector: Connector = {
  type: "email",
  async send(event: HookEvent, config: Record<string, unknown>): Promise<ConnectorResult> {
    const to = Array.isArray(config.to) ? config.to.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
    if (to.length === 0) return { ok: false, error: "aucun destinataire" };
    if (!isMailerConfigured()) return { ok: false, error: "SMTP non configuré" };
    const locale = templateLocale(config);
    const values = templateValues(event, locale);
    const tpl = emailTemplate(event, locale);
    const subject = renderTemplate(tpl.subject, values);
    const text = renderTemplate(tpl.body, values);
    const html = emailHtml({
      body: text,
      actionUrl: String(values.actionUrl ?? ""),
      actionLabel: translate(getMessages(locale), "hook.openAction"),
    });
    try {
      await sendMail({ to, subject, text, html });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "send failed" };
    }
  },
};
