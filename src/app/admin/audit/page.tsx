"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";

type Row = {
  id: string;
  at: string;
  action: string;
  actor: string | null;
  actorIp: string | null;
  target: string | null;
  detail: unknown;
  ok: boolean;
};

const ACTIONS = [
  "auth.login",
  "auth.login_failed",
  "auth.login_blocked",
  "deploy.one_click",
  "ingestSource.created",
  "ingestSource.deleted",
  "hook.created",
  "hook.deleted",
  "notificationTarget.created",
  "notificationTarget.updated",
  "notificationTarget.deleted",
];
const PAGE = 50;

export default function AuditPage() {
  const { t } = useI18n();
  const { stampFull } = useTimeFormat();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [f, setF] = useState({ action: "", actor: "", ok: "", from: "", to: "" });

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
    try {
      const res = await fetch(`/api/v1/audit?${params}`);
      if (!res.ok) {
        setError(`${res.status}`);
        setRows([]);
        setTotal(0);
        return;
      }
      const data = await res.json();
      setError("");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("network");
    }
  }, [offset, f]);

  useEffect(() => { void load(); }, [load]);

  function setFilter(patch: Partial<typeof f>) {
    setOffset(0);
    setF((cur) => ({ ...cur, ...patch }));
  }

  return (
    <main style={{ padding: 16 }}>
      <h1>{t("audit.title")}</h1>
      {error && <p role="alert">{t("audit.loadFailed")} ({error})</p>}

      <table>
        <thead>
          <tr>
            <th>{t("common.date")}</th>
            <th>{t("audit.colAction")}</th>
            <th>{t("audit.colActor")}</th>
            <th>IP</th>
            <th>{t("audit.colTarget")}</th>
            <th>OK</th>
            <th>{t("audit.colDetail")}</th>
          </tr>
          <tr>
            <td>
              <input type="date" value={f.from} onChange={(e) => setFilter({ from: e.target.value })} />{" "}
              <input type="date" value={f.to} onChange={(e) => setFilter({ to: e.target.value })} />
            </td>
            <td>
              <select value={f.action} onChange={(e) => setFilter({ action: e.target.value })}>
                <option value="">{t("audit.all")}</option>
                {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </td>
            <td><input value={f.actor} onChange={(e) => setFilter({ actor: e.target.value })} /></td>
            <td />
            <td />
            <td>
              <select value={f.ok} onChange={(e) => setFilter({ ok: e.target.value })}>
                <option value="">{t("audit.all")}</option>
                <option value="true">ok</option>
                <option value="false">{t("audit.failed")}</option>
              </select>
            </td>
            <td />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{stampFull(r.at)}</td>
              <td>{r.action}</td>
              <td>{r.actor ?? "—"}</td>
              <td>{r.actorIp ?? "—"}</td>
              <td>{r.target ?? ""}</td>
              <td>{r.ok ? "✓" : "✗"}</td>
              <td>
                {r.detail ? (
                  <details>
                    <summary>{t("audit.view")}</summary>
                    <pre>{JSON.stringify(r.detail, null, 2)}</pre>
                  </details>
                ) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>{t("logs.prev")}</button>
        <span>{total === 0 ? "0" : `${offset + 1}–${Math.min(offset + PAGE, total)}`} / {total}</span>
        <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>{t("logs.next")}</button>
      </div>
    </main>
  );
}
