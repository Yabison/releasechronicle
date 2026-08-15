"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/useI18n";
import { APP_NAME, APP_VERSION } from "@/lib/appMeta";
import styles from "./login.module.css";

export default function LoginPage() {
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
      </div>
    </main>
  );
}
