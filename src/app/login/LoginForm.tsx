"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/useI18n";
import { APP_NAME, APP_VERSION } from "@/lib/appMeta";
import type { DemoAccount } from "@/lib/auth/demoAccounts";
import styles from "./login.module.css";

/**
 * `accounts` is null on any real deployment: only the public demo (demoAccounts())
 * and a local dev instance (devAccounts()) advertise credentials, and `kind` says
 * which, since the two need different wording.
 */
export default function LoginForm({
  accounts,
  kind,
}: {
  accounts: DemoAccount[] | null;
  kind: "demo" | "dev";
}) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setBusy(false);
    if (res.ok) router.push(params.get("next") || "/");
    else setError(res.status === 401 ? t("login.badCreds") : `Erreur ${res.status}`);
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className={styles.logo} aria-hidden />
          <div>
            <div className={styles.brandName}>{APP_NAME}</div>
            <div className={styles.brandVersion}>v{APP_VERSION}</div>
          </div>
        </div>
        <h1 className={styles.title}>{t("login.title")}</h1>
        <form onSubmit={submit} className={styles.form}>
          <label className={styles.field}>
            <span>{t("login.userPh")}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("login.userPh")} autoFocus autoComplete="username" />
          </label>
          <label className={styles.field}>
            <span>{t("login.passPh")}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("login.passPh")} autoComplete="current-password" />
          </label>
          <button type="submit" className={styles.submit} disabled={busy || !username || !password}>
            {busy ? t("common.loading") : t("common.login")}
          </button>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>

        {accounts && (
          <section className={styles.demo} aria-labelledby="demo-accounts">
            <h2 id="demo-accounts" className={styles.demoTitle}>
              {t(kind === "dev" ? "login.devTitle" : "login.demoTitle")}
            </h2>
            <p className={styles.demoHint}>
              {t(kind === "dev" ? "login.devHint" : "login.demoHint")}
            </p>
            <ul className={styles.demoList}>
              {accounts.map((a) => (
                <li key={a.username}>
                  <button
                    type="button"
                    className={styles.demoAccount}
                    onClick={() => { setUsername(a.username); setPassword(a.password); setError(""); }}
                  >
                    <code className={styles.demoUser}>{a.username}</code>
                    <span className={styles.demoRoles}>{a.roles.join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
            {/* Only truthful when there is in fact one password: the dev accounts
                each carry their own, and the buttons above already fill it in. */}
            {accounts.every((a) => a.password === accounts[0].password) && (
              <p className={styles.demoPassword}>
                {t("login.demoPassword")} <code>{accounts[0].password}</code>
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
