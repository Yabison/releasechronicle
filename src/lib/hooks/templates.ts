import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { HookEvent } from "./types";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n";

export type TemplateColor = "red" | "orange" | "green";
export type EmailTemplate = { subject: string; body: string };
export type TeamsTemplate = { title: string; text: string };
export type ColorTemplates = { email: EmailTemplate; teams: TeamsTemplate };

/** Built-in fallbacks per locale — used when a config file is missing or a field is absent. */
const DEFAULTS: Record<Locale, Record<TemplateColor, ColorTemplates>> = {
  fr: {
    red: {
      email: { subject: "🔴 [{product}/{service}] {kind}", body: "Incident / rollback sur {product}/{service} ({environment})\nVersion {version} · statut {status} · par {actor}\n{comment}" },
      teams: { title: "🔴 {kind} — {product}/{service} ({environment})", text: "Version {version} · statut {status} · par {actor}. {comment}" },
    },
    orange: {
      email: { subject: "🟠 [{product}/{service}] {kind}", body: "MEP en cours sur {product}/{service} ({environment})\nVersion {version} · {fromStatus} → {toStatus} · statut {status} · par {actor}\n{comment}" },
      teams: { title: "🟠 {kind} — {product}/{service} ({environment})", text: "Version {version} · {fromStatus} → {toStatus} · par {actor}. {comment}" },
    },
    green: {
      email: { subject: "🟢 [{product}/{service}] terminé — {version}", body: "Terminé sur {product}/{service} ({environment})\nVersion {version} · statut {status} · par {actor}\n{comment}" },
      teams: { title: "🟢 {kind} — {product}/{service} ({environment})", text: "Version {version} · statut {status} · par {actor}. {comment}" },
    },
  },
  en: {
    red: {
      email: { subject: "🔴 [{product}/{service}] {kind}", body: "Incident / rollback on {product}/{service} ({environment})\nVersion {version} · status {status} · by {actor}\n{comment}" },
      teams: { title: "🔴 {kind} — {product}/{service} ({environment})", text: "Version {version} · status {status} · by {actor}. {comment}" },
    },
    orange: {
      email: { subject: "🟠 [{product}/{service}] {kind}", body: "Release in progress on {product}/{service} ({environment})\nVersion {version} · {fromStatus} → {toStatus} · status {status} · by {actor}\n{comment}" },
      teams: { title: "🟠 {kind} — {product}/{service} ({environment})", text: "Version {version} · {fromStatus} → {toStatus} · by {actor}. {comment}" },
    },
    green: {
      email: { subject: "🟢 [{product}/{service}] done — {version}", body: "Done on {product}/{service} ({environment})\nVersion {version} · status {status} · by {actor}\n{comment}" },
      teams: { title: "🟢 {kind} — {product}/{service} ({environment})", text: "Version {version} · status {status} · by {actor}. {comment}" },
    },
  },
};

/** Classify a hook event into a severity color used to pick a template.
 *  red = incident/rollback, green = finished (deploy reached VALIDATE),
 *  orange = everything else (MEP in progress: created / in-progress / testing…). */
export function classifyEvent(event: HookEvent): TemplateColor {
  if (event.kind === "deploy.rolled_back" || event.kind === "incident.created") return "red";
  const toStatus = (event.data as { toStatus?: unknown }).toStatus;
  if (event.kind === "deploy.status_changed" && toStatus === "VALIDATE") return "green";
  return "orange";
}

const cache = new Map<string, ColorTemplates>();

/** Clear the file cache — for tests that swap config files. */
export function clearTemplateCache(): void {
  cache.clear();
}

/** Locale of a notification target, read from its free-form config (defaults to fr). */
export function templateLocale(config: Record<string, unknown>): Locale {
  return isLocale(config.locale) ? config.locale : DEFAULT_LOCALE;
}

function readFile(name: string): Partial<ColorTemplates> | null {
  try {
    return (parse(readFileSync(join(process.cwd(), "config", "hook-templates", name), "utf8")) ?? {}) as Partial<ColorTemplates>;
  } catch {
    return null; // file missing/unreadable
  }
}

/** Templates for a color, in a locale. The `{color}.{locale}.yml` override wins; the
 *  legacy `{color}.yml` serves the default locale; built-in defaults fill any gap. */
function load(color: TemplateColor, locale: Locale): ColorTemplates {
  const key = `${color}:${locale}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const def = DEFAULTS[locale][color];
  const p = readFile(`${color}.${locale}.yml`) ?? (locale === DEFAULT_LOCALE ? readFile(`${color}.yml`) : null) ?? {};
  const result: ColorTemplates = {
    email: { subject: p.email?.subject ?? def.email.subject, body: p.email?.body ?? def.email.body },
    teams: { title: p.teams?.title ?? def.teams.title, text: p.teams?.text ?? def.teams.text },
  };
  cache.set(key, result);
  return result;
}

export function emailTemplate(event: HookEvent, locale: Locale = DEFAULT_LOCALE): EmailTemplate {
  return load(classifyEvent(event), isLocale(locale) ? locale : DEFAULT_LOCALE).email;
}
export function teamsTemplate(event: HookEvent, locale: Locale = DEFAULT_LOCALE): TeamsTemplate {
  return load(classifyEvent(event), isLocale(locale) ? locale : DEFAULT_LOCALE).teams;
}
