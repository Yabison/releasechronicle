"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";
import { LOCALES } from "@/i18n";
import { THEMES, type Theme } from "@/lib/theme";
import type { UserPreferences } from "@/lib/userPreferences";
import { savePreferencesAction } from "@/app/actions/preferences";
import styles from "./SettingsModal.module.css";

const THEME_ICON: Record<Theme, string> = { light: "☀", dark: "☾", system: "◐" };

/**
 * The signed-in user's settings: who they are, how the app should look, and
 * where it should open.
 *
 * No password field. Local credentials live in config/auth-users.yml, a file
 * baked into the image and owned by root, so a change written there would be
 * lost on the next deploy — and an LDAP account has no password to change here
 * at all. The panel says which provider is in charge instead of offering
 * something that would not stick.
 */
export function SettingsModal({
  me,
  preferences,
  currentPath,
  currentQuery,
  onClose,
}: {
  me: { name: string; roles: string[]; provider: "local" | "ldap" };
  preferences: UserPreferences;
  /** Where the user is right now, offered as the landing page in one click. */
  currentPath: string;
  currentQuery: string;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const { mode: timeMode } = useTimeFormat();
  const [draft, setDraft] = useState<UserPreferences>(preferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: Partial<UserPreferences>) => setDraft((prev) => ({ ...prev, ...patch }));

  async function save() {
    setBusy(true);
    setError("");
    const res = await savePreferencesAction(draft);
    setBusy(false);
    if (!res.ok) { setError(t(res.error)); return; }
    // A full reload, not router.refresh(): the locale is chosen when the server
    // renders, so the whole tree has to come back in the new language.
    window.location.reload();
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t("settings.title")} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>{t("settings.title")}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t("common.close")}>×</button>
        </div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("settings.account")}</h3>
          <dl className={styles.facts}>
            <dt>{t("settings.name")}</dt>
            <dd>{me.name}</dd>
            <dt>{t("settings.roles")}</dt>
            <dd>{me.roles.length ? me.roles.join(" · ") : "—"}</dd>
            <dt>{t("settings.password")}</dt>
            <dd className={styles.muted}>
              {me.provider === "ldap" ? t("settings.passwordLdap") : t("settings.passwordLocal")}
            </dd>
          </dl>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("settings.language")}</h3>
          <div className={styles.choices}>
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                data-active={(draft.locale ?? locale) === l}
                aria-pressed={(draft.locale ?? locale) === l}
                onClick={() => set({ locale: l })}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("settings.theme")}</h3>
          <div className={styles.choices}>
            {THEMES.map((value) => (
              <button
                key={value}
                type="button"
                data-active={draft.theme === value}
                aria-pressed={draft.theme === value}
                onClick={() => set({ theme: value })}
              >
                <span aria-hidden>{THEME_ICON[value]}</span> {t(`theme.${value}`)}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("settings.time")}</h3>
          <div className={styles.choices}>
            {(["local", "utc"] as const).map((m) => (
              <button
                key={m}
                type="button"
                data-active={(draft.timeMode ?? timeMode) === m}
                aria-pressed={(draft.timeMode ?? timeMode) === m}
                onClick={() => set({ timeMode: m })}
              >
                {m === "local" ? t("time.local") : "UTC"}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("settings.home")}</h3>
          <p className={styles.hint}>{t("settings.homeHint")}</p>
          <div className={styles.homeRow}>
            <code className={styles.path}>{draft.homePath ?? t("settings.homeDefault")}</code>
            {draft.homeQuery && <code className={styles.query}>?{draft.homeQuery}</code>}
          </div>
          <div className={styles.choices}>
            <button type="button" onClick={() => set({ homePath: currentPath, homeQuery: null })}>
              {t("settings.useCurrentPage")}
            </button>
            <button
              type="button"
              disabled={!currentQuery}
              title={currentQuery ? undefined : t("settings.noSearchHere")}
              onClick={() => set({ homePath: currentPath, homeQuery: currentQuery })}
            >
              {t("settings.useCurrentSearch")}
            </button>
            <button type="button" onClick={() => set({ homePath: null, homeQuery: null })}>
              {t("settings.resetHome")}
            </button>
          </div>
        </section>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className={styles.save} onClick={save} disabled={busy}>
            {busy ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
