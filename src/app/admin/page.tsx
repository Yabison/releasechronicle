"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./admin.module.css";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@/i18n";
import { TRANSITION_OPTIONS } from "@/lib/hooks/transitions";

type EnvRow = { id: string; slug: string; name: string; color: string; sortOrder: number };
type EnvGroup = { id: string; slug: string; name: string; members: string[]; sortOrder: number };
const DEFAULT_ENV_COLOR = "#64748b";

const HOOK_KINDS = [
  "deploy.created",
  "deploy.status_changed",
  "deploy.status_undone",
  "deploy.rolled_back",
  "incident.created",
  "maintenance.created",
] as const;

type Section = "companies" | "envs" | "products" | "tags" | "hooks" | "sources" | "targets" | "directory" | "calendars";
const NAV: { id: Section; label: string }[] = [
  { id: "companies", label: "admin.nav.companies" },
  { id: "envs", label: "admin.nav.envs" },
  { id: "products", label: "admin.nav.products" },
  { id: "tags", label: "admin.nav.tags" },
  { id: "hooks", label: "admin.nav.hooks" },
  { id: "sources", label: "admin.nav.sources" },
  { id: "targets", label: "admin.nav.targets" },
  { id: "directory", label: "admin.nav.directory" },
  { id: "calendars", label: "admin.nav.calendars" },
];

type Company = { id: string; name: string; slug: string; autoLotNaming: string; sortOrder?: number };
type Product = { id: string; name: string; slug: string; envWorkflow: string[]; sortOrder?: number };
type Hook = { id: string; type: string; events: string[]; transitions: string[]; config: { url?: string; to?: string[]; [key: string]: unknown }; enabled: boolean; targetId?: string | null };
type IngestSource = { id: string; label: string; token: string; defaultEnvironment: string | null };
type Service = { id: string; name: string; slug: string; type?: string; buildUrlTemplate?: string | null; isMaster?: boolean; envWorkflow?: string[]; envWorkflowOverride?: boolean; sortOrder?: number };
type Target = { id: string; type: string; label: string; config: { to?: string[]; url?: string; locale?: string } };
type DirUser = { id: string; username: string; name: string; email: string | null; roles: string[]; syncedAt: string };
type TagRow = { name: string; slug: string; color: string | null; count: number };
type CalFeed = { id: string; name: string; token: string; company: string | null; product: string | null; service: string | null; environment: string | null; types: string[] };

export default function AdminPage() {
  const { t: tr } = useI18n();
  const { stampFull } = useTimeFormat();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [prodCompany, setProdCompany] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [workflows, setWorkflows] = useState<Record<string, string[]>>({});
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [hookProduct, setHookProduct] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [hookType, setHookType] = useState("webhook");
  const [hookTo, setHookTo] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>(["*"]);
  const [hookTransitions, setHookTransitions] = useState<string[]>([]);
  const [hookMsg, setHookMsg] = useState("");
  // Non-null while the hook form is editing an existing hook (PUT) instead of
  // creating a new one (POST). The same form/state is reused for both, per the
  // "no second modal" constraint.
  const [editingHookId, setEditingHookId] = useState<string | null>(null);
  // The raw config of the hook currently being edited (null when creating). The
  // form only knows `url`/`to`, but a config can carry keys it doesn't own (e.g.
  // webhook `headers`); this is spread back in on save so editing never drops them.
  const [editingRawConfig, setEditingRawConfig] = useState<Record<string, unknown> | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [sources, setSources] = useState<IngestSource[]>([]);
  const [srcService, setSrcService] = useState("");
  const [srcLabel, setSrcLabel] = useState("");
  const [srcEnv, setSrcEnv] = useState("PROD");
  const [srcScope, setSrcScope] = useState<"SERVICE" | "COMPANY" | "GLOBAL">("SERVICE");
  const [envs, setEnvs] = useState<EnvRow[]>([]);
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvColor, setNewEnvColor] = useState("#3b82f6");
  const [envGroups, setEnvGroups] = useState<EnvGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);
  // Per-service env workflow being edited (only meaningful when the service overrides).
  const [svcWf, setSvcWf] = useState<Record<string, string[]>>({});
  const [active, setActive] = useState<Section>("companies");
  const [targets, setTargets] = useState<Target[]>([]);
  const [tType, setTType] = useState("email");
  const [tLabel, setTLabel] = useState("");
  const [tEmails, setTEmails] = useState("");
  const [tUrl, setTUrl] = useState("");
  // Locale of the alert templates sent to this target (email/teams).
  const [tLocale, setTLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [tEdits, setTEdits] = useState<Record<string, string>>({});
  const [hookTargetId, setHookTargetId] = useState("");
  const [dirUsers, setDirUsers] = useState<DirUser[]>([]);
  const [ldapCfg, setLdapCfg] = useState<{ configured: boolean; server: string | null }>({ configured: false, server: null });
  const [tags, setTags] = useState<TagRow[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [feeds, setFeeds] = useState<CalFeed[]>([]);
  const [newFeed, setNewFeed] = useState<{ name: string; company: string; product: string; service: string; environment: string; types: string[] }>({ name: "", company: "", product: "", service: "", environment: "", types: [] });
  const [allProducts, setAllProducts] = useState<{ id: string; slug: string; name: string; company: string }[]>([]);
  const [prodServices, setProdServices] = useState<Record<string, Service[]>>({});
  // Dedicated services list for the calendar-feed form's dependent dropdown,
  // loaded on product change so it never collides with the products section.
  const [feedServices, setFeedServices] = useState<Service[]>([]);

  const envColorMap: Record<string, string> = Object.fromEntries(envs.map((e) => [e.slug, e.color]));

  useEffect(() => {
    void refresh();
    void loadEnvs();
    void loadTargets();
    void loadDirectory();
    void loadAllProducts();
    void loadTags();
    void loadFeeds();
  }, []);

  async function loadFeeds() {
    const res = await fetch("/api/v1/calendar-feeds");
    setFeeds(res.ok ? await res.json() : []);
  }
  function toggleFeedType(t: string) {
    setNewFeed((f) => ({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] }));
  }
  // Company → product → service cascade for the feed form. Changing an upstream
  // field resets the ones below it and reloads the service list when relevant.
  function onFeedCompany(company: string) {
    setNewFeed((f) => ({ ...f, company, product: "", service: "" }));
    setFeedServices([]);
  }
  async function onFeedProduct(product: string) {
    setNewFeed((f) => ({ ...f, product, service: "" }));
    if (!newFeed.company || !product) { setFeedServices([]); return; }
    const res = await fetch(`/api/v1/services?company=${newFeed.company}&product=${product}`);
    setFeedServices(res.ok ? await res.json() : []);
  }
  async function addFeed() {
    setStatus("");
    if (!newFeed.name.trim()) { setStatus("nom du calendrier requis"); return; }
    const res = await fetch("/api/v1/calendar-feeds", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(newFeed),
    });
    if (res.ok) { setNewFeed({ name: "", company: "", product: "", service: "", environment: "", types: [] }); await loadFeeds(); }
    else setStatus(`Error ${res.status}`);
  }
  async function deleteFeed(id: string) {
    if (!window.confirm(tr("confirm.deleteFeed"))) return;
    await fetch(`/api/v1/calendar-feeds/${id}`, { method: "DELETE" });
    await loadFeeds();
  }
  function feedUrl(token: string) {
    return `${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/calendars/${token}.ics`;
  }

  async function loadTags() {
    const res = await fetch("/api/v1/tags");
    setTags(res.ok ? await res.json() : []);
  }
  function tagReq(method: string, body: unknown) {
    return fetch("/api/v1/tags", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }
  async function addTag() {
    setStatus("");
    if (!newTagName.trim()) { setStatus("nom de tag requis"); return; }
    const res = await tagReq("POST", { name: newTagName, color: newTagColor });
    if (res.ok) { setNewTagName(""); await loadTags(); } else setStatus(`Error ${res.status}`);
  }
  async function saveTagColor(name: string, color: string) {
    const res = await tagReq("POST", { name, color });
    if (res.ok) await loadTags(); else setStatus(`Error ${res.status}`);
  }
  async function renameTag(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return;
    const res = await tagReq("PUT", { name: oldName, newName });
    if (res.ok) await loadTags(); else setStatus(`Error ${res.status}`);
  }
  async function deleteTag(name: string) {
    // Not a config-only delete: it strips the tag from every event carrying it.
    if (!window.confirm(tr("confirm.deleteTag", { name }))) return;
    await tagReq("DELETE", { name });
    await loadTags();
  }

  async function refresh() {
    const res = await fetch("/api/v1/companies");
    setCompanies(await res.json());
  }

  // Reorder helpers: swap the sortOrder of two neighbours, then reload.
  async function moveCompany(idx: number, dir: -1 | 1) {
    const a = companies[idx], b = companies[idx + dir];
    if (!a || !b) return;
    const put = (slug: string, sortOrder: number) =>
      fetch(`/api/v1/companies/${slug}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder }) });
    await Promise.all([put(a.slug, b.sortOrder ?? idx + dir), put(b.slug, a.sortOrder ?? idx)]);
    await refresh();
  }
  async function moveProduct(idx: number, dir: -1 | 1) {
    const a = products[idx], b = products[idx + dir];
    if (!a || !b) return;
    const put = (slug: string, sortOrder: number) =>
      fetch(`/api/v1/products/${slug}?company=${prodCompany}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder }) });
    await Promise.all([put(a.slug, b.sortOrder ?? idx + dir), put(b.slug, a.sortOrder ?? idx)]);
    await loadProducts(prodCompany);
  }
  async function moveServiceOrder(productSlug: string, list: Service[], idx: number, dir: -1 | 1) {
    const a = list[idx], b = list[idx + dir];
    if (!a || !b) return;
    const put = (slug: string, sortOrder: number) =>
      fetch(`/api/v1/services/${slug}?company=${prodCompany}&product=${productSlug}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder }) });
    await Promise.all([put(a.slug, b.sortOrder ?? idx + dir), put(b.slug, a.sortOrder ?? idx)]);
    await loadProducts(prodCompany);
  }

  async function loadEnvs() {
    const res = await fetch("/api/v1/environments");
    setEnvs(res.ok ? await res.json() : []);
    const gr = await fetch("/api/v1/environment-groups");
    setEnvGroups(gr.ok ? await gr.json() : []);
  }
  function toggleNewGroupMember(slug: string) {
    setNewGroupMembers((m) => (m.includes(slug) ? m.filter((x) => x !== slug) : [...m, slug]));
  }
  async function addEnvGroup() {
    setStatus("");
    if (!newGroupName.trim()) { setStatus("nom de groupe requis"); return; }
    if (newGroupMembers.length === 0) { setStatus("choisis au moins un environnement"); return; }
    const res = await fetch("/api/v1/environment-groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newGroupName, members: newGroupMembers }),
    });
    if (res.ok) { setNewGroupName(""); setNewGroupMembers([]); await loadEnvs(); } else setStatus(`Error ${res.status}`);
  }
  async function deleteEnvGroup(id: string) {
    if (!window.confirm(tr("confirm.deleteEnvGroup"))) return;
    await fetch(`/api/v1/environment-groups/${id}`, { method: "DELETE" });
    await loadEnvs();
  }
  async function putEnv(id: string, data: Record<string, unknown>) {
    return fetch(`/api/v1/environments/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
  }
  async function addEnv() {
    setStatus("");
    if (!newEnvName.trim()) { setStatus("nom d'env requis"); return; }
    const res = await fetch("/api/v1/environments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newEnvName, color: newEnvColor }),
    });
    if (res.ok) { setNewEnvName(""); await loadEnvs(); } else setStatus(`Error ${res.status}`);
  }
  async function saveEnvColor(id: string, color: string) {
    const res = await putEnv(id, { color });
    if (res.ok) await loadEnvs(); else setStatus(`Error ${res.status}`);
  }
  async function moveEnv(idx: number, dir: -1 | 1) {
    const a = envs[idx], b = envs[idx + dir];
    if (!a || !b) return;
    await Promise.all([putEnv(a.id, { sortOrder: b.sortOrder }), putEnv(b.id, { sortOrder: a.sortOrder })]);
    await loadEnvs();
  }
  async function deleteEnv(id: string) {
    if (!window.confirm(tr("confirm.deleteEnv"))) return;
    await fetch(`/api/v1/environments/${id}`, { method: "DELETE" });
    await loadEnvs();
  }

  async function loadTargets() {
    const res = await fetch("/api/v1/notification-targets");
    setTargets(res.ok ? await res.json() : []);
  }
  async function addTarget() {
    setStatus("");
    const config = tType === "email"
      ? { to: tEmails.split(/[,\n]/).map((s) => s.trim()).filter(Boolean), locale: tLocale }
      : { url: tUrl.trim(), locale: tLocale };
    const res = await fetch("/api/v1/notification-targets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: tType, label: tLabel, config }),
    });
    if (res.ok) { setTLabel(""); setTEmails(""); setTUrl(""); await loadTargets(); }
    else setStatus(`Error ${res.status}`);
  }
  async function deleteTarget(id: string) {
    if (!window.confirm(tr("confirm.deleteTarget"))) return;
    const res = await fetch(`/api/v1/notification-targets/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setStatus(d.error ?? `Error ${res.status}`); }
    await loadTargets();
  }
  async function saveTargetConfig(t: Target, config: Record<string, unknown>) {
    const res = await fetch(`/api/v1/notification-targets/${t.id}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ config }),
    });
    if (res.ok) await loadTargets(); else setStatus(`Error ${res.status}`);
  }

  async function loadDirectory() {
    const res = await fetch("/api/v1/directory");
    setDirUsers(res.ok ? await res.json() : []);
    const cfg = await fetch("/api/v1/directory/config");
    setLdapCfg(cfg.ok ? await cfg.json() : { configured: false, server: null });
  }
  async function syncDirectory() {
    setStatus("");
    const res = await fetch("/api/v1/directory/sync", { method: "POST" }); // admin session cookie
    const d = await res.json().catch(() => ({}));
    setStatus(d.ok ? `Annuaire synchronisé : ${d.synced} utilisateurs` : `Sync: ${d.error ?? res.status}`);
    await loadDirectory();
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    const res = await fetch("/api/v1/companies", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setName("");
      await refresh();
    } else {
      setStatus(`Error ${res.status}`);
    }
  }

  async function loadProducts(companySlug: string) {
    setProdCompany(companySlug);
    // A company switch invalidates the hooks section entirely: the previous
    // product/hooks/edit-in-progress belong to a different company and must not
    // leak into whatever gets picked next.
    setHookProduct("");
    setHooks([]);
    resetHookForm();
    if (!companySlug) { setProducts([]); setProdServices({}); return; }
    const res = await fetch(`/api/v1/products?company=${companySlug}`);
    const list: Product[] = await res.json();
    setProducts(list);
    setWorkflows(Object.fromEntries(list.map((p) => [p.slug, p.envWorkflow ?? []])));
    const entries = await Promise.all(
      list.map(async (p) => {
        const r = await fetch(`/api/v1/services?company=${companySlug}&product=${p.slug}`);
        return [p.slug, (r.ok ? await r.json() : []) as Service[]] as const;
      }),
    );
    setProdServices(Object.fromEntries(entries));
    // Build-URL is edited per service; seed the inputs from each service.
    const allSvcs = entries.flatMap(([, svcs]) => svcs);
    setTemplates(Object.fromEntries(allSvcs.map((s) => [s.id, s.buildUrlTemplate ?? ""])));
    setSvcWf(Object.fromEntries(allSvcs.map((s) => [s.id, s.envWorkflow ?? []])));
  }

  async function putService(productSlug: string, s: Service, body: Record<string, unknown>) {
    setStatus("");
    const res = await fetch(`/api/v1/services/${s.slug}?company=${prodCompany}&product=${productSlug}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) await loadProducts(prodCompany); else setStatus(`Error ${res.status}`);
  }
  // Break inheritance: seed the service workflow from the product default and mark it overriding.
  function customizeSvcWf(productSlug: string, s: Service, inherited: string[]) {
    return putService(productSlug, s, { envWorkflowOverride: true, envWorkflow: inherited });
  }
  function inheritSvcWf(productSlug: string, s: Service) {
    return putService(productSlug, s, { envWorkflowOverride: false });
  }
  function saveSvcWf(productSlug: string, s: Service) {
    return putService(productSlug, s, { envWorkflowOverride: true, envWorkflow: svcWf[s.id] ?? [] });
  }
  function toggleSvcWfEnv(id: string, env: string) {
    setSvcWf((w) => {
      const cur = w[id] ?? [];
      return { ...w, [id]: cur.includes(env) ? cur.filter((x) => x !== env) : [...cur, env] };
    });
  }
  function moveSvcWfEnv(id: string, env: string, dir: -1 | 1) {
    setSvcWf((w) => {
      const cur = [...(w[id] ?? [])];
      const i = cur.indexOf(env), j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return w;
      [cur[i], cur[j]] = [cur[j], cur[i]];
      return { ...w, [id]: cur };
    });
  }

  async function loadAllProducts() {
    const res = await fetch("/api/v1/companies");
    const cs: Company[] = res.ok ? await res.json() : [];
    const entries = await Promise.all(
      cs.map(async (c) => {
        const r = await fetch(`/api/v1/products?company=${c.slug}`);
        const list: Product[] = r.ok ? await r.json() : [];
        return list.map((p) => ({ id: p.id, slug: p.slug, name: p.name, company: c.slug }));
      }),
    );
    setAllProducts(entries.flat());
  }

  async function saveServiceBuildUrl(productSlug: string, s: Service) {
    setStatus("");
    const res = await fetch(`/api/v1/services/${s.slug}?company=${prodCompany}&product=${productSlug}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buildUrlTemplate: templates[s.id] ?? "" }),
    });
    if (res.ok) await loadProducts(prodCompany);
    else setStatus(`Error ${res.status}`);
  }

  function toggleWf(slug: string, env: string) {
    setWorkflows((w) => {
      const cur = w[slug] ?? [];
      return { ...w, [slug]: cur.includes(env) ? cur.filter((x) => x !== env) : [...cur, env] };
    });
  }
  function moveWf(slug: string, env: string, dir: -1 | 1) {
    setWorkflows((w) => {
      const cur = [...(w[slug] ?? [])];
      const i = cur.indexOf(env);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return w;
      [cur[i], cur[j]] = [cur[j], cur[i]];
      return { ...w, [slug]: cur };
    });
  }
  async function saveWorkflow(slug: string) {
    setStatus("");
    const res = await fetch(`/api/v1/products/${slug}?company=${prodCompany}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ envWorkflow: workflows[slug] ?? [] }),
    });
    if (res.ok) await loadProducts(prodCompany); else setStatus(`Error ${res.status}`);
  }

  async function saveServiceMaster(productSlug: string, s: Service, isMaster: boolean) {
    setStatus("");
    const res = await fetch(`/api/v1/services/${s.slug}?company=${prodCompany}&product=${productSlug}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isMaster }),
    });
    if (res.ok) await loadProducts(prodCompany); else setStatus(`Error ${res.status}`);
  }

  async function saveAutoLotNaming(slug: string, autoLotNaming: string) {
    setStatus("");
    const res = await fetch(`/api/v1/companies/${slug}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoLotNaming }),
    });
    if (res.ok) await refresh(); else setStatus(`Error ${res.status}`);
  }

  async function moveServiceTo(productSlug: string, serviceSlug: string, targetProductId: string) {
    setStatus("");
    const res = await fetch(`/api/v1/services/${serviceSlug}?company=${prodCompany}&product=${productSlug}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: targetProductId }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setStatus(d.error ?? `Error ${res.status}`); }
    await loadProducts(prodCompany);
    await loadAllProducts();
  }
  async function moveProductTo(productSlug: string, targetCompanyId: string) {
    setStatus("");
    const res = await fetch(`/api/v1/products/${productSlug}?company=${prodCompany}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: targetCompanyId }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setStatus(d.error ?? `Error ${res.status}`); }
    await loadProducts(prodCompany);
    await loadAllProducts();
  }

  async function loadHooks(productSlug: string) {
    setHookProduct(productSlug);
    setSrcService(""); setSources([]);
    // Switching product would otherwise let a stale editingHookId (belonging to
    // the previous product) leak into a PUT sent to the new product's hooks.
    resetHookForm();
    void loadServices(productSlug);
    if (!prodCompany || !productSlug) { setHooks([]); return; }
    const res = await fetch(`/api/v1/products/${productSlug}/hooks?company=${prodCompany}`);
    setHooks(res.ok ? await res.json() : []);
  }
  async function loadServices(productSlug: string) {
    if (!prodCompany || !productSlug) { setServices([]); return; }
    const res = await fetch(`/api/v1/services?company=${prodCompany}&product=${productSlug}`);
    setServices(res.ok ? await res.json() : []);
  }
  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }
  function toggleEvent(value: string) {
    setHookEvents((prev) => {
      // choosing a concrete kind drops the "*" wildcard; empty selection falls back to "*"
      const base = prev.filter((e) => e !== "*");
      const next = toggle(base, value);
      return next.length === 0 ? ["*"] : next;
    });
  }
  async function addHook() {
    if (!hookProduct) return;
    setHookMsg("");
    const transitions = hookEvents.includes("deploy.status_changed") ? hookTransitions : [];
    let payload: Record<string, unknown>;
    if (hookTargetId) {
      payload = { type: hookType, targetId: hookTargetId, events: hookEvents, transitions };
    } else {
      const to = hookTo.split(",").map((s) => s.trim()).filter(Boolean);
      if (hookType === "email" && to.length === 0) { setHookMsg("Au moins un destinataire email requis."); return; }
      if (hookType !== "email" && !hookUrl.trim()) { setHookMsg("URL requise."); return; }
      const configPart = hookType === "email"
        ? { type: "email", config: { to } }
        : { type: hookType, url: hookUrl.trim() };
      payload = { ...configPart, events: hookEvents, transitions };
    }
    const res = await fetch(`/api/v1/products/${hookProduct}/hooks?company=${prodCompany}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setHookUrl(""); setHookTo(""); setHookEvents(["*"]); setHookTransitions([]); setHookTargetId("");
      setHookMsg(tr("admin.hookAdded"));
      await loadHooks(hookProduct);
    } else {
      setHookMsg(`Erreur ${res.status}`);
    }
  }
  async function removeHook(id: string) {
    if (!window.confirm(tr("confirm.deleteHook"))) return;
    await fetch(`/api/v1/products/${hookProduct}/hooks/${id}?company=${prodCompany}`, {
      method: "DELETE",
    });
    await loadHooks(hookProduct);
  }

  // Clears the hook form back to "create" defaults, whether that's because an
  // edit was cancelled, an edit was saved, or the product/company changed.
  function resetHookForm() {
    setEditingHookId(null);
    setEditingRawConfig(null);
    setHookType("webhook");
    setHookTargetId("");
    setHookUrl("");
    setHookTo("");
    setHookEvents(["*"]);
    setHookTransitions([]);
  }
  function cancelEditHook() {
    resetHookForm();
    setHookMsg("");
  }
  // Loads an existing hook into the create form, switching it into "edit" mode.
  // `type` is intentionally left as-is but the form disables that field: the
  // backend accepts and ignores a `type` in the PUT body, so letting it be
  // edited here would silently do nothing.
  function startEditHook(h: Hook) {
    setEditingHookId(h.id);
    setHookMsg("");
    setHookType(h.type);
    setHookTargetId(h.targetId ?? "");
    setHookEvents(h.events.length ? h.events : ["*"]);
    setHookTransitions(h.transitions ?? []);
    // A target-based hook's config is owned by the target ({} on the hook itself),
    // so there's nothing to preserve there. Otherwise, keep the full config —
    // including keys the form doesn't own (e.g. webhook `headers`) — so saving
    // the edit can spread it back in instead of replacing it wholesale.
    setEditingRawConfig(h.targetId ? null : (h.config ?? {}));
    if (h.targetId) {
      setHookUrl("");
      setHookTo("");
    } else {
      setHookUrl(h.config?.url ?? "");
      setHookTo((h.config?.to ?? []).join(", "));
    }
  }
  async function saveHookEdit() {
    if (!hookProduct || !editingHookId) return;
    setHookMsg("");
    const transitions = hookEvents.includes("deploy.status_changed") ? hookTransitions : [];
    // Partial update: only send the fields the form owns. `type` is never sent —
    // it's not updatable and the form keeps it disabled while editing.
    const payload: Record<string, unknown> = { events: hookEvents, transitions };
    if (hookTargetId) {
      payload.targetId = hookTargetId;
    } else {
      const to = hookTo.split(",").map((s) => s.trim()).filter(Boolean);
      if (hookType === "email" && to.length === 0) { setHookMsg("Au moins un destinataire email requis."); return; }
      if (hookType !== "email" && !hookUrl.trim()) { setHookMsg("URL requise."); return; }
      // Spread the hook's raw config first so keys the form doesn't own (e.g.
      // webhook `headers`) survive the edit instead of being silently dropped.
      payload.config = hookType === "email" ? { ...editingRawConfig, to } : { ...editingRawConfig, url: hookUrl.trim() };
      // Explicit detach: harmless no-op if the hook already had no target, and
      // required if switching a target-based hook back to inline config.
      payload.targetId = null;
    }
    const res = await fetch(`/api/v1/products/${hookProduct}/hooks/${editingHookId}?company=${prodCompany}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      resetHookForm();
      setHookMsg(tr("admin.hookUpdated"));
    } else {
      const d = await res.json().catch(() => ({}));
      setHookMsg(d.error ?? `Erreur ${res.status}`);
    }
    // Always re-read from the server: a rejected PUT must not leave the form's
    // optimistic state looking like it stuck.
    await loadHooks(hookProduct);
  }
  function submitHookForm() {
    if (editingHookId) void saveHookEdit();
    else void addHook();
  }
  async function toggleHookEnabled(h: Hook) {
    setHookMsg("");
    const res = await fetch(`/api/v1/products/${hookProduct}/hooks/${h.id}?company=${prodCompany}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !h.enabled }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setHookMsg(d.error ?? `Erreur ${res.status}`);
    }
    // Re-read from the server either way, so a rejected toggle visibly snaps back.
    await loadHooks(hookProduct);
  }

  async function loadSources(serviceSlug: string) {
    setSrcService(serviceSlug);
    if (!prodCompany || !hookProduct || !serviceSlug) { setSources([]); return; }
    const res = await fetch(`/api/v1/services/${serviceSlug}/ingest-sources?company=${prodCompany}&product=${hookProduct}`);
    setSources(res.ok ? await res.json() : []);
  }
  async function addSource() {
    if (!srcService) return;
    setStatus("");
    const res = await fetch(`/api/v1/services/${srcService}/ingest-sources?company=${prodCompany}&product=${hookProduct}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: srcLabel, defaultEnvironment: srcEnv }),
    });
    if (res.ok) { setSrcLabel(""); await loadSources(srcService); } else setStatus(`Error ${res.status}`);
  }
  async function removeSource(id: string) {
    if (!window.confirm(tr("confirm.deleteSource"))) return;
    await fetch(`/api/v1/services/${srcService}/ingest-sources/${id}?company=${prodCompany}&product=${hookProduct}`, { method: "DELETE" });
    await loadSources(srcService);
  }

  async function loadScopedSources() {
    setStatus("");
    if (srcScope === "GLOBAL") {
      const res = await fetch("/api/v1/ingest-sources");
      setSources(res.ok ? await res.json() : []);
    } else if (srcScope === "COMPANY") {
      if (!prodCompany) { setSources([]); return; }
      const res = await fetch(`/api/v1/companies/${prodCompany}/ingest-sources`);
      setSources(res.ok ? await res.json() : []);
    }
  }
  async function addScopedSource() {
    setStatus("");
    if (!srcLabel.trim()) { setStatus("label requis"); return; }
    const path = srcScope === "GLOBAL"
      ? "/api/v1/ingest-sources"
      : `/api/v1/companies/${prodCompany}/ingest-sources`;
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: srcLabel, defaultEnvironment: srcEnv }),
    });
    if (res.ok) { setSrcLabel(""); await loadScopedSources(); } else setStatus(`Error ${res.status}`);
  }
  async function removeScopedSource(id: string) {
    if (!window.confirm(tr("confirm.deleteSource"))) return;
    await fetch(`/api/v1/ingest-sources/${id}`, { method: "DELETE" });
    await loadScopedSources();
  }

  useEffect(() => {
    if (srcScope !== "SERVICE") void loadScopedSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcScope, prodCompany]);

  // hookTargetId reset used to live in a useEffect keyed on hookType, but that
  // fired on every hookType change including the programmatic one made when
  // populating the form from startEditHook, clobbering the target it had just
  // set. Resetting it directly in the (user-only) onChange below avoids that.
  function onHookTypeChange(value: string) {
    setHookType(value);
    setHookTargetId("");
  }

  const companyPicker = (
    <label className={styles.slug}>
      Company{" "}
      <select value={prodCompany} onChange={(e) => loadProducts(e.target.value)}>
        <option value="">—</option>
        {companies.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
      </select>
    </label>
  );
  const productPicker = (
    <label className={styles.slug}>
      {tr("common.product")}{" "}
      <select value={hookProduct} onChange={(e) => loadHooks(e.target.value)}>
        <option value="">—</option>
        {products.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
      </select>
    </label>
  );

  function curlExample(scope: "SERVICE" | "COMPANY" | "GLOBAL", s: IngestSource) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const fields: string[] = [`    "version": "1.2.3"`];
    if (scope === "GLOBAL") fields.push(`    "company": "acme"`);
    if (scope !== "SERVICE") fields.push(`    "product": "checkout"`, `    "service": "checkout-api"`);
    fields.push(
      `    "environment": "${s.defaultEnvironment ?? "PROD"}"`,
      `    "changeType": "NORMAL"`,
      `    "deployStatus": "DEPLOYED"`,
      `    "requester": "gitlab-ci"`,
      `    "lot": "release-2026.07"`,
      `    "comment": "Déploiement automatique via la CI"`,
    );
    return `curl -X POST ${origin}/api/v1/ingest/deployments \\
  -H "authorization: Bearer ${s.token}" \\
  -H "content-type: application/json" \\
  -d '{
${fields.join(",\n")}
  }'`;
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.title}>ADMIN</span>
      </header>

      <div className={styles.body}>
        <nav className={styles.nav}>
          {NAV.map((n) => (
            <button key={n.id} className={styles.navItem} data-active={active === n.id} onClick={() => setActive(n.id)}>
              {tr(n.label)}
            </button>
          ))}
          <Link className={styles.navItem} href="/admin/public">{tr("nav.public")}</Link>
          <Link className={styles.navItem} href={`/admin/logs${prodCompany ? `?company=${prodCompany}${hookProduct ? `&product=${hookProduct}` : ""}` : ""}`}>Logs ↗</Link>
          <Link className={styles.navItem} href="/admin/audit">{tr("audit.title")} ↗</Link>
        </nav>

        <main className={styles.panel}>
          {status && <div className={styles.status}>{status}</div>}

          {active === "companies" && (
            <section>
              <h2 className={styles.panelTitle}>{tr("admin.companies")}</h2>
              <div className={styles.card}>
                <div className={styles.cardHead}>{tr("common.create")}</div>
                <form onSubmit={createCompany} className={styles.row}>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("admin.companyNamePh")} />
                  <button type="submit" className={styles.primary}>{tr("common.create")}</button>
                </form>
              </div>
              <ul className={styles.list}>
                {companies.map((c, idx) => (
                  <li key={c.id} className={styles.listItem}>
                    <button onClick={() => moveCompany(idx, -1)} disabled={idx === 0} title={tr("admin.moveUp")}>↑</button>
                    <button onClick={() => moveCompany(idx, 1)} disabled={idx === companies.length - 1} title={tr("admin.moveDown")}>↓</button>
                    <strong>{c.name}</strong> <span className={styles.slug}>({c.slug})</span>
                    <label className={styles.slug}>
                      Nommage lots auto{" "}
                      <select
                        value={c.autoLotNaming ?? "master"}
                        onChange={(e) => saveAutoLotNaming(c.slug, e.target.value)}
                      >
                        <option value="master">{tr("admin.masterApp")}</option>
                        <option value="date">{tr("common.date")}</option>
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {active === "envs" && (
            <section>
              <h2 className={styles.panelTitle}>{tr("admin.environments")}</h2>
              <div className={styles.card}>
                <div className={styles.cardHead}>{tr("admin.add")}</div>
                <div className={styles.row}>
                  <input value={newEnvName} onChange={(e) => setNewEnvName(e.target.value)} placeholder={tr("admin.envNamePh")} />
                  <input type="color" value={newEnvColor} onChange={(e) => setNewEnvColor(e.target.value)} />
                  <button className={styles.primary} onClick={addEnv}>+ env</button>
                </div>
              </div>
              <ul className={styles.list}>
                {envs.map((e, idx) => (
                  <li key={e.id} className={styles.envRow}>
                    <span className={styles.envTag} style={{ background: e.color }}>{e.slug}</span>
                    <span className={styles.slug}>{e.name}</span>
                    <input type="color" value={e.color} onChange={(ev) => saveEnvColor(e.id, ev.target.value)} />
                    <button onClick={() => moveEnv(idx, -1)} disabled={idx === 0}>←</button>
                    <button onClick={() => moveEnv(idx, 1)} disabled={idx === envs.length - 1}>→</button>
                    <button className={styles.danger} onClick={() => deleteEnv(e.id)}>×</button>
                  </li>
                ))}
              </ul>

              <h2 className={styles.panelTitle}>{tr("admin.envGroups")}</h2>
              <p className={styles.muted}>{tr("admin.groupHelp")}</p>
              <div className={styles.card}>
                <div className={styles.cardHead}>{tr("admin.addGroup")}</div>
                <div className={styles.row}>
                  <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder={tr("admin.groupNamePh")} />
                  <button className={styles.primary} onClick={addEnvGroup}>{tr("admin.addGroupBtn")}</button>
                </div>
                <div className={styles.wfChips}>
                  {envs.map((e) => (
                    <button
                      key={e.id}
                      className={styles.wfChip}
                      style={{ background: newGroupMembers.includes(e.slug) ? e.color : "transparent", color: newGroupMembers.includes(e.slug) ? "#fff" : "var(--text)", borderColor: e.color }}
                      onClick={() => toggleNewGroupMember(e.slug)}
                    >
                      {newGroupMembers.includes(e.slug) ? "✓ " : ""}{e.slug}
                    </button>
                  ))}
                </div>
              </div>
              <ul className={styles.list}>
                {envGroups.length === 0 && <li className={styles.muted}>{tr("admin.noGroup")}</li>}
                {envGroups.map((g) => (
                  <li key={g.id} className={styles.envRow}>
                    <span className={styles.envTag} style={{ background: "#334155" }}>{g.name}</span>
                    <span className={styles.slug}>{g.members.join(", ")}</span>
                    <button className={styles.danger} onClick={() => deleteEnvGroup(g.id)}>×</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {active === "tags" && (
            <section>
              <h2 className={styles.panelTitle}>{tr("admin.tagsTitle")}</h2>
              <p className={styles.muted}>{tr("admin.tagHelp")}</p>
              <div className={styles.card}>
                <div className={styles.cardHead}>{tr("admin.add")}</div>
                <div className={styles.row}>
                  <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder={tr("admin.tagNamePh")} />
                  <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} />
                  <button className={styles.primary} onClick={addTag}>+ tag</button>
                </div>
              </div>
              <ul className={styles.list}>
                {tags.length === 0 && <li className={styles.muted}>{tr("drawer.noTag")}</li>}
                {tags.map((t) => (
                  <li key={t.name} className={styles.envRow}>
                    <span className={styles.envTag} style={{ background: t.color ?? "#94a3b8" }}>{t.name}</span>
                    <input
                      key={t.name}
                      defaultValue={t.name}
                      onBlur={(e) => { const v = e.target.value.trim(); if (!v) { e.target.value = t.name; return; } renameTag(t.name, v); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      title={tr("admin.renameTitle")}
                      style={{ width: 130 }}
                    />
                    <input type="color" value={t.color ?? "#6366f1"} onChange={(ev) => saveTagColor(t.name, ev.target.value)} title={tr("admin.colorTitle")} />
                    <span className={styles.muted} title={tr("admin.eventsTitle")}>{t.count}</span>
                    <button className={styles.danger} onClick={() => deleteTag(t.name)} title={tr("admin.deleteEverywhere")}>×</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {active === "products" && (
            <section>
              <h2 className={styles.panelTitle}>{tr("admin.products")}</h2>
              <div className={styles.contextBar}>{companyPicker}</div>
              {!prodCompany ? (
                <p className={styles.muted}>{tr("admin.pickCompany")}</p>
              ) : products.length === 0 ? (
                <p className={styles.muted}>{tr("admin.noProduct")}</p>
              ) : (
                products.map((p, pidx) => (
                  <div key={p.id} className={styles.card}>
                    <div className={styles.cardHead}>
                      <button onClick={() => moveProduct(pidx, -1)} disabled={pidx === 0} title={tr("admin.moveUp")}>↑</button>
                      <button onClick={() => moveProduct(pidx, 1)} disabled={pidx === products.length - 1} title={tr("admin.moveDown")}>↓</button>
                      {" "}{p.name} <span className={styles.slug}>({p.slug})</span>
                    </div>
                    <div className={styles.row}>
                      <label className={styles.slug}>
                        {tr("admin.moveToCompanyLabel")}{" "}
                        <select
                          value=""
                          onChange={(e) => { if (e.target.value) void moveProductTo(p.slug, e.target.value); }}
                        >
                          <option value="">{tr("admin.moveToCompany")}</option>
                          {companies.filter((c) => c.slug !== prodCompany).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <ul className={styles.list}>
                      {(prodServices[p.slug] ?? []).length === 0 && (
                        <li className={styles.muted}>{tr("admin.noService")}</li>
                      )}
                      {(prodServices[p.slug] ?? []).map((s, sidx, arr) => (
                        <li key={s.id} className={styles.listItem}>
                          <button onClick={() => moveServiceOrder(p.slug, arr, sidx, -1)} disabled={sidx === 0} title={tr("admin.moveUp")}>↑</button>
                          <button onClick={() => moveServiceOrder(p.slug, arr, sidx, 1)} disabled={sidx === arr.length - 1} title={tr("admin.moveDown")}>↓</button>
                          <strong>{s.name}</strong>
                          <span className={styles.badge}>{s.type}</span>
                          <span className={styles.slug}>({s.slug})</span>
                          <label className={styles.slug}>
                            <input
                              type="checkbox"
                              checked={!!s.isMaster}
                              onChange={(e) => saveServiceMaster(p.slug, s, e.target.checked)}
                            />{" "}
                            {tr("admin.mainApp")}
                          </label>
                          <label className={styles.slug}>
                            {tr("admin.toProduct")}{" "}
                            <select
                              value=""
                              onChange={(e) => { if (e.target.value) void moveServiceTo(p.slug, s.slug, e.target.value); }}
                            >
                              <option value="">{tr("admin.move")}</option>
                              {allProducts.filter((ap) => ap.id !== p.id).map((ap) => (
                                <option key={ap.id} value={ap.id}>{ap.company}/{ap.name}</option>
                              ))}
                            </select>
                          </label>
                          <span className={styles.slug}>Build URL</span>
                          <input
                            value={templates[s.id] ?? ""}
                            onChange={(e) => setTemplates((t) => ({ ...t, [s.id]: e.target.value }))}
                            placeholder="https://ci/builds/{version}"
                            style={{ flex: 1, minWidth: 200 }}
                          />
                          <button onClick={() => saveServiceBuildUrl(p.slug, s)}>{tr("common.save")}</button>

                          <div className={styles.wfChips} style={{ flexBasis: "100%" }}>
                            <span className={styles.slug}>{tr("admin.workflowEnv")}</span>
                            {!s.envWorkflowOverride ? (
                              <>
                                <span className={styles.muted}>
                                  {tr("admin.inherited")} {(workflows[p.slug] ?? []).length ? (workflows[p.slug] ?? []).join(" → ") : "(aucun)"}
                                </span>
                                <button className={styles.wfAdd} onClick={() => customizeSvcWf(p.slug, s, workflows[p.slug] ?? [])}>{tr("admin.customize")}</button>
                              </>
                            ) : (
                              <>
                                {(svcWf[s.id] ?? []).map((env, idx) => (
                                  <span key={env} className={styles.wfChip} style={{ background: envColorMap[env] ?? DEFAULT_ENV_COLOR }}>
                                    {env}
                                    <button onClick={() => moveSvcWfEnv(s.id, env, -1)} disabled={idx === 0}>←</button>
                                    <button onClick={() => moveSvcWfEnv(s.id, env, 1)} disabled={idx === (svcWf[s.id]?.length ?? 0) - 1}>→</button>
                                    <button onClick={() => toggleSvcWfEnv(s.id, env)}>×</button>
                                  </span>
                                ))}
                                {envs.map((e) => e.slug).filter((slug) => !(svcWf[s.id] ?? []).includes(slug)).map((slug) => (
                                  <button key={slug} className={styles.wfAdd} onClick={() => toggleSvcWfEnv(s.id, slug)}>+ {slug}</button>
                                ))}
                                <button onClick={() => saveSvcWf(p.slug, s)}>{tr("common.save")}</button>
                                <button className={styles.wfAdd} onClick={() => inheritSvcWf(p.slug, s)}>{tr("admin.revertInherit")}</button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className={styles.wfChips}>
                      <span className={styles.slug}>{tr("admin.workflowEnv")}</span>
                      {(workflows[p.slug] ?? []).map((env, idx) => (
                        <span key={env} className={styles.wfChip} style={{ background: envColorMap[env] ?? DEFAULT_ENV_COLOR }}>
                          {env}
                          <button onClick={() => moveWf(p.slug, env, -1)} disabled={idx === 0}>←</button>
                          <button onClick={() => moveWf(p.slug, env, 1)} disabled={idx === (workflows[p.slug]?.length ?? 0) - 1}>→</button>
                          <button onClick={() => toggleWf(p.slug, env)}>×</button>
                        </span>
                      ))}
                      {envs.map((e) => e.slug).filter((slug) => !(workflows[p.slug] ?? []).includes(slug)).map((slug) => (
                        <button key={slug} className={styles.wfAdd} onClick={() => toggleWf(p.slug, slug)}>+ {slug}</button>
                      ))}
                      <button onClick={() => saveWorkflow(p.slug)}>{tr("common.save")}</button>
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

          {active === "hooks" && (
            <section>
              <h2 className={styles.panelTitle}>{tr("admin.hooksTitle")}</h2>
              <div className={styles.contextBar}>{companyPicker}{prodCompany && productPicker}</div>
              {!hookProduct ? (
                <p className={styles.muted}>{tr("admin.pickCompanyProduct")}</p>
              ) : (
                <>
                  <ul className={styles.hookList}>
                    {hooks.length === 0 && <span className={styles.muted}>{tr("admin.noHook")}</span>}
                    {hooks.map((h) => (
                      <li key={h.id} className={styles.hookItem}>
                        <span className={styles.badge} style={{ textTransform: "uppercase", fontWeight: 700 }}>{h.type}</span>
                        <span className={styles.muted}>
                          {h.targetId
                            ? `→ ${targets.find((t) => t.id === h.targetId)?.label ?? "cible"}`
                            : h.type === "email"
                              ? `→ ${h.config?.to?.join(", ") ?? "(aucun destinataire)"}`
                              : (h.config?.url ?? "(aucune URL)")}
                        </span>
                        <span className={styles.badge}>
                          {h.events.includes("*") ? tr("admin.allEvents") : h.events.join(", ")}
                        </span>
                        {h.transitions.length > 0 && (
                          <span className={styles.transBadge}>{h.transitions.map((t) => t.replace(">", " → ")).join(", ")}</span>
                        )}
                        <label className={styles.slug}>
                          <input type="checkbox" checked={h.enabled} onChange={() => toggleHookEnabled(h)} />{" "}
                          {tr("admin.hookEnabledLabel")}
                        </label>
                        <button onClick={() => startEditHook(h)}>{tr("admin.editHook")}</button>
                        <button className={styles.danger} onClick={() => removeHook(h.id)}>×</button>
                      </li>
                    ))}
                  </ul>

                  <div className={styles.hookForm}>
                    <div className={styles.cardHead}>{editingHookId ? tr("admin.editHookTitle") : tr("admin.newHook")}</div>
                    <div className={styles.row}>
                      <select value={hookType} onChange={(e) => onHookTypeChange(e.target.value)} disabled={!!editingHookId}>
                        <option value="webhook">webhook</option>
                        <option value="teams">teams</option>
                        <option value="email">email</option>
                      </select>
                      {editingHookId && <span className={styles.muted}>{tr("admin.hookTypeLocked")}</span>}
                      <select value={hookTargetId} onChange={(e) => setHookTargetId(e.target.value)}>
                        <option value="">{tr("admin.hookNoneOption")}</option>
                        {targets.filter((t) => t.type === hookType).map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                      {!hookTargetId && (
                        hookType === "email" ? (
                          <input value={hookTo} onChange={(e) => setHookTo(e.target.value)} placeholder="dest1@x, dest2@x" style={{ width: 260 }} />
                        ) : (
                          <input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://webhook.site/…" style={{ width: 320 }} />
                        )
                      )}
                    </div>

                    <div className={styles.legend}>{tr("admin.eventsLegend")}</div>
                    <div className={styles.checks}>
                      {HOOK_KINDS.map((k) => (
                        <label key={k}>
                          <input type="checkbox" checked={hookEvents.includes(k)} onChange={() => toggleEvent(k)} />
                          {k}
                        </label>
                      ))}
                    </div>

                    {hookEvents.includes("deploy.status_changed") && (
                      <>
                        <div className={styles.legend}>{tr("admin.transLegend")}</div>
                        <div className={styles.checks}>
                          {TRANSITION_OPTIONS.map((t) => (
                            <label key={t}>
                              <input type="checkbox" checked={hookTransitions.includes(t)} onChange={() => setHookTransitions((prev) => toggle(prev, t))} />
                              {t.replace(">", " → ")}
                            </label>
                          ))}
                        </div>
                      </>
                    )}

                    <button className={styles.primary} onClick={submitHookForm}>
                      {editingHookId ? tr("common.save") : "+ hook"}
                    </button>
                    {editingHookId && <button onClick={cancelEditHook}>{tr("common.cancel")}</button>}
                    {hookMsg && <span className={styles.muted} style={{ marginLeft: 8 }}>{hookMsg}</span>}
                  </div>
                </>
              )}
            </section>
          )}

          {active === "sources" && (
            <section>
              <h2 className={styles.panelTitle}>{tr("admin.sourcesTitle")}</h2>
              <div className={styles.contextBar}>
                <label className={styles.slug}>{tr("admin.scope")}{" "}
                  <select value={srcScope} onChange={(e) => { setSources([]); setSrcScope(e.target.value as "SERVICE" | "COMPANY" | "GLOBAL"); }}>
                    <option value="SERVICE">Service</option>
                    <option value="COMPANY">Company</option>
                    <option value="GLOBAL">Global</option>
                  </select>
                </label>
                {srcScope !== "GLOBAL" && companyPicker}
                {srcScope === "SERVICE" && prodCompany && productPicker}
              </div>

              {srcScope === "SERVICE" ? (
                !hookProduct ? (
                  <p className={styles.muted}>{tr("admin.pickCompanyProduct")}</p>
                ) : (
                  <>
                    <div className={styles.row}>
                      <label className={styles.slug}>Service{" "}
                        <select value={srcService} onChange={(e) => loadSources(e.target.value)}>
                          <option value="">—</option>
                          {services.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
                        </select>
                      </label>
                      {services.length === 0 && <span className={styles.muted}>{tr("admin.noServiceOnProduct")}</span>}
                    </div>
                    {srcService && (
                      <div className={styles.row}>
                        <input value={srcLabel} onChange={(e) => setSrcLabel(e.target.value)} placeholder="label (ex: gitlab-ci)" />
                        <select value={srcEnv} onChange={(e) => setSrcEnv(e.target.value)}>
                          {envs.map((e) => <option key={e.id} value={e.slug}>{e.slug}</option>)}
                          <option value="ALL">ALL (tous)</option>
                        </select>
                        <button className={styles.primary} onClick={addSource}>+ source</button>
                      </div>
                    )}
                  </>
                )
              ) : srcScope === "COMPANY" && !prodCompany ? (
                <p className={styles.muted}>{tr("admin.pickCompany")}</p>
              ) : (
                <div className={styles.row}>
                  <input value={srcLabel} onChange={(e) => setSrcLabel(e.target.value)} placeholder="label (ex: gitlab-ci)" />
                  <select value={srcEnv} onChange={(e) => setSrcEnv(e.target.value)}>
                    {envs.map((e) => <option key={e.id} value={e.slug}>{e.slug}</option>)}
                    <option value="ALL">ALL (tous)</option>
                  </select>
                  <button className={styles.primary} onClick={addScopedSource}>+ source</button>
                </div>
              )}

              <ul className={styles.list}>
                {sources.map((s) => (
                  <li key={s.id} className={styles.listItem} style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div className={styles.row} style={{ margin: 0 }}>
                      <strong>{s.label}</strong>
                      <span className={styles.badge}>{s.defaultEnvironment ?? "ALL"}</span>
                      <code className={styles.token}>{s.token}</code>
                      <button className={styles.danger} onClick={() => srcScope === "SERVICE" ? removeSource(s.id) : removeScopedSource(s.id)}>×</button>
                    </div>
                    <details className={styles.curl}>
                      <summary className={styles.slug}>curl</summary>
                      <pre>{curlExample(srcScope, s)}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {active === "targets" && (
            <section>
              <h2 className={styles.panelTitle}>{tr("admin.targetsTitle")}</h2>
              <div className={styles.card}>
                <div className={styles.cardHead}>{tr("admin.add")}</div>
                <div className={styles.row}>
                  <select value={tType} onChange={(e) => setTType(e.target.value)}>
                    <option value="email">email</option>
                    <option value="teams">teams</option>
                    <option value="webhook">webhook</option>
                  </select>
                  <input value={tLabel} onChange={(e) => setTLabel(e.target.value)} placeholder="label" style={{ width: 180 }} />
                  {tType === "email" ? (
                    <input value={tEmails} onChange={(e) => setTEmails(e.target.value)} placeholder="a@x, b@x" style={{ width: 260 }} />
                  ) : (
                    <input value={tUrl} onChange={(e) => setTUrl(e.target.value)} placeholder="https://…" style={{ width: 320 }} />
                  )}
                  <select value={tLocale} onChange={(e) => setTLocale(e.target.value as Locale)} title={tr("admin.targetLocale")}>
                    {LOCALES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                  </select>
                  <button className={styles.primary} onClick={addTarget}>{tr("admin.addTargetBtn")}</button>
                </div>
              </div>
              <ul className={styles.list}>
                {targets.length === 0 && <span className={styles.muted}>{tr("admin.noTarget")}</span>}
                {targets.map((t) => {
                  const editVal = tEdits[t.id] ?? (t.type === "email" ? (t.config.to ?? []).join(", ") : (t.config.url ?? ""));
                  return (
                    <li key={t.id} className={styles.listItem}>
                      <span className={styles.badge} style={{ textTransform: "uppercase", fontWeight: 700 }}>{t.type}</span>
                      <strong>{t.label}</strong>
                      <input
                        value={editVal}
                        onChange={(e) => setTEdits((m) => ({ ...m, [t.id]: e.target.value }))}
                        style={{ flex: 1, minWidth: 200 }}
                      />
                      <select
                        value={t.config.locale ?? DEFAULT_LOCALE}
                        title={tr("admin.targetLocale")}
                        onChange={(e) => void saveTargetConfig(t, { ...t.config, locale: e.target.value })}
                      >
                        {LOCALES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                      </select>
                      <button onClick={() => {
                        const config = t.type === "email"
                          ? { to: editVal.split(/[,\n]/).map((s) => s.trim()).filter(Boolean), locale: t.config.locale ?? DEFAULT_LOCALE }
                          : { url: editVal.trim(), locale: t.config.locale ?? DEFAULT_LOCALE };
                        void saveTargetConfig(t, config);
                      }}>{tr("common.save")}</button>
                      <button className={styles.danger} onClick={() => deleteTarget(t.id)}>×</button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {active === "directory" && (
            <section>
              <h2 className={styles.panelTitle}>{tr("admin.directoryTitle")}</h2>
              <div className={styles.card}>
                <div className={styles.cardHead}>{tr("admin.ldapSyncTitle")}</div>
                <div className={styles.row}>
                  <span className={styles.slug}>
                    {tr("admin.server")} {ldapCfg.configured ? <strong>{ldapCfg.server}</strong> : <em className={styles.muted}>{tr("admin.notConfigured")}</em>}
                  </span>
                </div>
                <div className={styles.row}>
                  <button
                    className={styles.primary}
                    onClick={syncDirectory}
                    disabled={!ldapCfg.configured}
                    title={ldapCfg.configured ? undefined : tr("admin.ldapNotConfigured")}
                  >
                    {tr("admin.syncNow")}
                  </button>
                </div>
              </div>
              <ul className={styles.list}>
                {dirUsers.length === 0 && <span className={styles.muted}>{tr("admin.noUser")}</span>}
                {dirUsers.map((u) => (
                  <li key={u.id} className={styles.listItem}>
                    <strong>{u.username}</strong>
                    <span className={styles.slug}>{u.name}</span>
                    <span className={styles.badge}>{u.roles.join(", ") || "—"}</span>
                    <span className={styles.muted}>{stampFull(u.syncedAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {active === "calendars" && (
            <section>
              <h2 className={styles.panelTitle}>{tr("admin.calendarsIcs")}</h2>
              <p className={styles.muted}>{tr("admin.feedHelp")}</p>
              <div className={styles.card}>
                <div className={styles.cardHead}>{tr("admin.newFeed")}</div>
                <div className={styles.row}>
                  <input value={newFeed.name} onChange={(e) => setNewFeed({ ...newFeed, name: e.target.value })} placeholder={tr("admin.feedNamePh")} />
                </div>
                <div className={styles.row}>
                  <select value={newFeed.company} onChange={(e) => onFeedCompany(e.target.value)}>
                    <option value="">{tr("admin.allCompanies")}</option>
                    {companies.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                  </select>
                  <select
                    value={newFeed.product}
                    disabled={!newFeed.company}
                    onChange={(e) => onFeedProduct(e.target.value)}
                  >
                    <option value="">{newFeed.company ? tr("admin.allProductsOpt") : tr("admin.pickCompanyFirst")}</option>
                    {allProducts.filter((p) => p.company === newFeed.company).map((p) => (
                      <option key={p.id} value={p.slug}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={newFeed.service}
                    disabled={!newFeed.product}
                    onChange={(e) => setNewFeed({ ...newFeed, service: e.target.value })}
                  >
                    <option value="">{newFeed.product ? tr("admin.allServicesOpt") : tr("admin.pickProductFirst")}</option>
                    {feedServices.map((s) => (
                      <option key={s.id} value={s.slug}>{s.name}{s.type ? ` (${s.type})` : ""}</option>
                    ))}
                  </select>
                  <select value={newFeed.environment} onChange={(e) => setNewFeed({ ...newFeed, environment: e.target.value })}>
                    <option value="">{tr("admin.allEnvsOpt")}</option>
                    {envs.map((en) => <option key={en.id} value={en.slug}>{en.slug}</option>)}
                  </select>
                </div>
                <div className={styles.wfChips}>
                  <span className={styles.slug}>{tr("admin.typesLabel")}</span>
                  {["DEPLOYMENT", "INCIDENT", "MAINTENANCE"].map((t) => (
                    <button
                      key={t}
                      className={styles.wfChip}
                      style={{ background: newFeed.types.includes(t) ? DEFAULT_ENV_COLOR : "transparent", color: newFeed.types.includes(t) ? "#fff" : "var(--text)", borderColor: DEFAULT_ENV_COLOR }}
                      onClick={() => toggleFeedType(t)}
                    >
                      {newFeed.types.includes(t) ? "✓ " : ""}{t}
                    </button>
                  ))}
                  <span className={styles.muted}>{tr("admin.feedEmptyHint")}</span>
                  <button className={styles.primary} onClick={addFeed}>{tr("admin.addFeedBtn")}</button>
                </div>
              </div>
              <ul className={styles.list}>
                {feeds.length === 0 && <li className={styles.muted}>{tr("admin.noFeed")}</li>}
                {feeds.map((f) => (
                  <li key={f.id} className={styles.listItem}>
                    <strong>{f.name}</strong>
                    <span className={styles.slug}>
                      {[f.company, f.product, f.service, f.environment].filter(Boolean).join(" / ") || "tout"}
                      {f.types.length ? ` · ${f.types.join(", ")}` : ""}
                    </span>
                    <button onClick={() => navigator.clipboard?.writeText(feedUrl(f.token))} title={tr("admin.copyIcs")}>{tr("admin.copyUrl")}</button>
                    <a href={feedUrl(f.token)} target="_blank" rel="noreferrer" className={styles.slug}>{tr("admin.open")}</a>
                    <button className={styles.danger} onClick={() => deleteFeed(f.id)}>×</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
