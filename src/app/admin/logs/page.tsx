"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";

type Company = { id: string; name: string; slug: string };
type Product = { id: string; name: string; slug: string };
type Row = { id: string; kind: string; status: string; attempts: number; statusCode: number | null; error: string | null; createdAt: string; payload: unknown; hookType: string };

const KINDS = ["deploy.created", "deploy.status_changed", "deploy.status_undone", "deploy.rolled_back", "incident.created", "maintenance.created"];
const PAGE = 50;

export default function LogsPage() {
  const { t } = useI18n();
  const { stampFull } = useTimeFormat();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [f, setF] = useState({ kind: "", type: "", status: "", statusCode: "", error: "", from: "", to: "" });

  useEffect(() => {
    fetch("/api/v1/companies").then((r) => r.json()).then(setCompanies);
    const p = new URLSearchParams(window.location.search);
    if (p.get("company")) setCompany(p.get("company")!);
    if (p.get("product")) setProduct(p.get("product")!);
  }, []);

  useEffect(() => {
    if (!company) { setProducts([]); return; }
    fetch(`/api/v1/products?company=${company}`).then((r) => r.json()).then(setProducts);
  }, [company]);

  const load = useCallback(async () => {
    if (!company || !product) { setRows([]); setTotal(0); return; }
    const params = new URLSearchParams({ company, limit: String(PAGE), offset: String(offset) });
    if (f.kind) params.set("kind", f.kind);
    if (f.type) params.set("type", f.type);
    if (f.status) params.set("status", f.status);
    if (f.statusCode) params.set("statusCode", f.statusCode);
    if (f.error) params.set("error", f.error);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    const res = await fetch(`/api/v1/products/${product}/hooks/deliveries?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
  }, [company, product, offset, f]);

  useEffect(() => { void load(); }, [load]);

  function setFilter(patch: Partial<typeof f>) { setOffset(0); setF((cur) => ({ ...cur, ...patch })); }

  return (
    <main style={{ padding: 16 }}>
      <h1>{t("logs.title")}</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select value={company} onChange={(e) => { setProduct(""); setOffset(0); setCompany(e.target.value); }}>
          <option value="">— company —</option>
          {companies.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={product} onChange={(e) => { setOffset(0); setProduct(e.target.value); }}>
          <option value="">— produit —</option>
          {products.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
        </select>
      </div>

      {/* Wide table: scroll inside its own container, never the whole page. */}
      <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr><th>{t("common.date")}</th><th>Kind</th><th>Type</th><th>OK</th><th>Code</th><th>{t("logs.colError")}</th><th>Payload</th></tr>
          <tr>
            <td><input type="date" value={f.from} onChange={(e) => setFilter({ from: e.target.value })} /> <input type="date" value={f.to} onChange={(e) => setFilter({ to: e.target.value })} /></td>
            <td><select value={f.kind} onChange={(e) => setFilter({ kind: e.target.value })}><option value="">tous</option>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></td>
            <td><select value={f.type} onChange={(e) => setFilter({ type: e.target.value })}><option value="">tous</option>{["webhook", "teams", "email"].map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
            <td><select value={f.status} onChange={(e) => setFilter({ status: e.target.value })}><option value="">tous</option><option value="PENDING">PENDING</option><option value="OK">OK</option><option value="FAILED">FAILED</option><option value="DEAD">DEAD</option></select></td>
            <td><input style={{ width: 60 }} value={f.statusCode} onChange={(e) => setFilter({ statusCode: e.target.value })} /></td>
            <td><input value={f.error} onChange={(e) => setFilter({ error: e.target.value })} placeholder={t("logs.containsPh")} /></td>
            <td />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td>{stampFull(d.createdAt)}</td>
              <td>{d.kind}</td>
              <td>{d.hookType}</td>
              <td>{d.status}{d.attempts > 1 ? ` ×${d.attempts}` : ""}</td>
              <td>{d.statusCode ?? ""}</td>
              <td>{d.error ?? ""}</td>
              <td>{d.payload ? <details><summary>voir</summary><pre>{JSON.stringify(d.payload, null, 2)}</pre></details> : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>{t("logs.prev")}</button>
        <span>{total === 0 ? "0" : `${offset + 1}–${Math.min(offset + PAGE, total)}`} / {total}</span>
        <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>{t("logs.next")}</button>
      </div>
    </main>
  );
}
