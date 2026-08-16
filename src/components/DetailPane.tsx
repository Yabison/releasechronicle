"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { EventDrawer } from "./EventDrawer";
import { EventModal } from "./EventModal";
import { LotModal } from "./LotModal";
import { ExcelBar } from "./ExcelBar";
import { TimelineRow } from "./TimelineRow";
import { buildServiceTimeline, groupByMonth, type EntryCategory, type TimelineEntry } from "@/lib/eventTimeline";
import { categoryLabel, changeTypeLabel } from "@/i18n/labels";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import { useI18n } from "@/i18n/useI18n";
import { useTimeFormat } from "@/lib/useTimeFormat";
import type { ClientEvent } from "@/lib/timeline";
import { siblings, lotKey } from "@/lib/deployLot";
import styles from "./DetailPane.module.css";

const FILTERS: EntryCategory[] = ["DEPLOY", "HOTFIX", "INCIDENT", "MAINTENANCE"];
// Visibility filters split DEPLOY into plain MEP + its PRE/POST phases.
type FilterKey = EntryCategory | "PRE" | "POST";
const FILTER_KEYS: FilterKey[] = ["DEPLOY", "PRE", "POST", "HOTFIX", "INCIDENT", "MAINTENANCE"];
/** Filter button label: the phase filters reuse the PRE/POST MEP change-type labels. */
function filterLabel(t: (key: string) => string, key: FilterKey): string {
  return key === "PRE" || key === "POST" ? changeTypeLabel(t, `${key}_MEP`) : categoryLabel(t, key);
}
function entryFilterKey(e: TimelineEntry): FilterKey {
  if (e.category === "DEPLOY") return e.phase === "PRE" ? "PRE" : e.phase === "POST" ? "POST" : "DEPLOY";
  return e.category;
}
const ALL_ENV = "ALL";

export function DetailPane({
  company,
  product,
  service,
  serviceName,
  productName,
  path,
  now,
  events,
  lotMembers,
  lotWarnings = {},
  buildUrlTemplate,
  envColors,
  envWorkflow,
  canWrite = true,
}: {
  company: string;
  product: string;
  service: string;
  serviceName: string;
  productName: string;
  path: string;
  now: string;
  events: ClientEvent[];
  lotMembers: Record<string, import("@/lib/deployLot").LotMember[]>;
  /** lotKey → labels of lot members not rolled back while the master app was. */
  lotWarnings?: Record<string, string[]>;
  buildUrlTemplate: string | null;
  envColors: Record<string, string>;
  envWorkflow: string[];
  canWrite?: boolean;
}) {
  const { t, locale } = useI18n();
  const { mode: timeMode } = useTimeFormat();
  // Every filter initializes from the URL and is mirrored back to it below, so a
  // filtered view is a link someone can bookmark or send to a colleague.
  const searchParams = useSearchParams();
  const sp = (k: string) => searchParams.get(k);
  // Environment is a global filter at the title level, scoping every event below.
  const environments = useMemo(
    () => [...new Set(events.map((e) => e.environment))].sort(),
    [events],
  );
  const [env, setEnv] = useState<string>(() => sp("env") ?? ALL_ENV);
  // Environment groups (e.g. ALLPROD = run+secure+prod) shown as extra filter options.
  const [envGroups, setEnvGroups] = useState<{ slug: string; name: string; members: string[] }[]>([]);
  const [loadWarn, setLoadWarn] = useState(false);
  useEffect(() => {
    fetch("/api/v1/environment-groups")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setEnvGroups)
      .catch(() => setLoadWarn(true));
  }, []);
  // When a group is selected, env holds "group:<slug>"; resolve its member set.
  const groupMembers = useMemo(() => {
    if (!env.startsWith("group:")) return null;
    const g = envGroups.find((x) => `group:${x.slug}` === env);
    return g ? new Set(g.members) : new Set<string>();
  }, [env, envGroups]);
  const showEnvBadge = env === ALL_ENV || groupMembers !== null;
  // Filters are visibility toggles, all enabled by default.
  const [active, setActive] = useState<Set<FilterKey>>(() => {
    const c = sp("cat");
    const keys = c ? c.split(",").filter((k): k is FilterKey => (FILTER_KEYS as string[]).includes(k)) : [];
    return keys.length ? new Set(keys) : new Set(FILTER_KEYS);
  });
  const [selected, setSelected] = useState<string | null>(null);
  // Open a specific MEP when linked with ?event=<id> (e.g. from the build trace in another tab).
  useEffect(() => {
    const eid = searchParams.get("event");
    if (eid && events.some((e) => e.id === eid)) setSelected(eid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, events]);
  const [modal, setModal] = useState(false);
  const [lotModal, setLotModal] = useState(false);
  // Free-form search: version/requester substrings, exact tag, occurredAt date range.
  // Default the range to the last 3 months (clear "Du" to see older events).
  const threeMonthsAgo = useMemo(() => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  }, [now]);
  const [q, setQ] = useState<{ version: string; requester: string; tags: string[]; hourType: string; from: string; to: string }>(() => ({
    version: sp("v") ?? "",
    requester: sp("req") ?? "",
    tags: sp("tags")?.split(",").filter(Boolean) ?? [],
    hourType: sp("ht") ?? "",
    // Absent = the 3-month default; an explicit empty `from=` means "cleared".
    from: sp("from") ?? threeMonthsAgo,
    to: sp("to") ?? "",
  }));

  // Mirror the filters into the URL. history.replaceState keeps this free: no
  // server round-trip (the page is force-dynamic) and no history-stack spam;
  // Next keeps useSearchParams in sync with it. Defaults are omitted so an
  // unfiltered view keeps a clean URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const put = (k: string, v: string | null) => (v === null ? p.delete(k) : p.set(k, v));
    put("env", env === ALL_ENV ? null : env);
    put("cat", active.size === FILTER_KEYS.length ? null : [...active].join(","));
    put("v", q.version || null);
    put("req", q.requester || null);
    put("tags", q.tags.length ? q.tags.join(",") : null);
    put("ht", q.hourType || null);
    put("from", q.from === threeMonthsAgo ? null : q.from);
    put("to", q.to || null);
    put("event", selected);
    const qs = p.toString();
    const next = window.location.pathname + (qs ? `?${qs}` : "");
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [env, active, q, selected, threeMonthsAgo]);
  // Tag filter: free-text input with autocomplete suggestions; picked tags become chips.
  const [tagInput, setTagInput] = useState("");
  function addTag(v: string) {
    const tag = v.trim();
    if (!tag) return;
    setQ((s) => (s.tags.includes(tag) ? s : { ...s, tags: [...s.tags, tag] }));
    setTagInput("");
  }

  // Near-real-time: pick up other users' changes without a manual reload.
  useAutoRefresh();

  const allTags = useMemo(() => [...new Set(events.flatMap((e) => e.tags))].sort(), [events]);
  // Candidate parents for a PRE/POST MEP: the MEP (NORMAL) and HOTFIX deployments.
  const mepCandidates = useMemo(
    () => events
      .filter((e) => e.type === "DEPLOYMENT" && (e.changeType === "NORMAL" || e.changeType === "HOTFIX"))
      .map((e) => ({ id: e.id, label: `${e.environment}${e.version ? ` v${e.version}` : ""} · ${changeTypeLabel(t, e.changeType)}` })),
    [events, t],
  );
  const [phaseDefaults, setPhaseDefaults] = useState<{ changeType: string; parentId: string; environment: string; parentOccurredAt: string } | null>(null);
  // Tag colours for the timeline chips.
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/v1/tags").then((r) => r.json()).then((rows: { name: string; slug: string; color: string | null }[]) => {
      const m: Record<string, string> = {};
      for (const t of rows) if (t.color) { m[t.name] = t.color; m[t.slug] = t.color; }
      setTagColors(m);
      // Cosmetic on purpose: a failure here only means uncoloured tag chips.
    }).catch(() => {});
  }, []);

  const scopedEvents = useMemo(() => {
    const ver = q.version.trim().toLowerCase();
    const req = q.requester.trim().toLowerCase();
    return events.filter((e) => {
      if (groupMembers) { if (!groupMembers.has(e.environment)) return false; }
      else if (env !== ALL_ENV && e.environment !== env) return false;
      if (ver && !(e.version ?? "").toLowerCase().includes(ver)) return false;
      if (req && !(e.requester ?? "").toLowerCase().includes(req)) return false;
      if (q.tags.length && !q.tags.some((t) => e.tags.includes(t))) return false;
      if (q.hourType && e.hourType !== q.hourType) return false;
      if (q.from && e.occurredAt.slice(0, 10) < q.from) return false;
      if (q.to && e.occurredAt.slice(0, 10) > q.to) return false;
      return true;
    });
  }, [events, env, q, groupMembers]);
  const timeline = useMemo(
    () => buildServiceTimeline(scopedEvents, new Date(now)),
    [scopedEvents, now],
  );

  // Maintenances are pinned to the top of the single list; history follows, month-grouped.
  const maintenancesToShow = useMemo(
    () => (active.has("MAINTENANCE") ? timeline.maintenances : []),
    [timeline.maintenances, active],
  );
  const historyToShow = useMemo(
    () => timeline.history.filter((e) => active.has(entryFilterKey(e))),
    [timeline.history, active],
  );
  const groups = useMemo(
    () => groupByMonth(historyToShow, { mode: timeMode, locale }),
    [historyToShow, timeMode, locale],
  );
  const selectedEvent = events.find((e) => e.id === selected) ?? null;
  const nothing = maintenancesToShow.length === 0 && groups.length === 0;

  function toggle(cat: FilterKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div>
      {loadWarn && <p role="alert" style={{ color: "var(--cat-incident, #dc2626)", fontSize: 13 }}>{t("common.loadFailed")}</p>}
      <div className={styles.head}>
        <div className={styles.crumb}>
          <span className={styles.crumbProduct}>{productName}</span> / <span className={styles.crumbService}>{serviceName}</span>
          <select className={styles.envSelect} value={env} onChange={(e) => setEnv(e.target.value)} aria-label={t("common.environment")}>
            <option value={ALL_ENV}>{t("detail.allEnvs")}</option>
            {envGroups.length > 0 && (
              <optgroup label={t("detail.groups")}>
                {envGroups.map((g) => (
                  <option key={g.slug} value={`group:${g.slug}`}>{g.name}</option>
                ))}
              </optgroup>
            )}
            {environments.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </div>
        {canWrite && (
          <div className={styles.headActions}>
            <ExcelBar filter={{ serviceId: events[0]?.serviceId, environment: env === ALL_ENV || groupMembers ? undefined : env }} />
            <button className={styles.newBtn} onClick={() => setModal(true)}>{t("detail.newEvent")}</button>
            <button className={styles.newBtn} onClick={() => setLotModal(true)}>{t("detail.newLot")}</button>
          </div>
        )}
      </div>

      <div className={styles.counters}>
        <Counter n={timeline.counters.deploy} label={categoryLabel(t, "DEPLOY")} cat="DEPLOY" />
        <Counter n={timeline.counters.incident} label={categoryLabel(t, "INCIDENT")} cat="INCIDENT" />
        <Counter n={timeline.counters.hotfix} label={categoryLabel(t, "HOTFIX")} cat="HOTFIX" />
        <Counter n={timeline.counters.maintenance} label={categoryLabel(t, "MAINTENANCE")} cat="MAINTENANCE" />
      </div>
      <div className={styles.legend}>
        {FILTERS.map((c) => (
          <span key={c} className={styles.legendItem}>
            <span className="catDot" data-cat={c} /> {categoryLabel(t, c)}
          </span>
        ))}
      </div>
      <div className={styles.filters}>
        <span className={styles.filtersLabel}>{t("detail.filter")}</span>
        {FILTER_KEYS.map((c) => (
          <button key={c} data-active={active.has(c)} onClick={() => toggle(c)}>
            {filterLabel(t, c)}
          </button>
        ))}
      </div>

      <div className={styles.search}>
        <input placeholder={t("common.version")} value={q.version} onChange={(e) => setQ({ ...q, version: e.target.value })} aria-label={t("common.version")} />
        <input placeholder={t("detail.requester")} value={q.requester} onChange={(e) => setQ({ ...q, requester: e.target.value })} aria-label={t("detail.requester")} />
        <span className={styles.tagFilter}>
          {q.tags.map((tg) => (
            <button
              key={tg}
              type="button"
              className={styles.tagFilterChip}
              data-active
              style={tagColors[tg] ? { background: tagColors[tg], color: "#fff", borderColor: tagColors[tg] } : undefined}
              onClick={() => setQ((s) => ({ ...s, tags: s.tags.filter((x) => x !== tg) }))}
              title={t("form.addTag")}
            >
              {tg} ×
            </button>
          ))}
          {allTags.length > 0 && (
            <>
              <input
                list="tagFilterOptions"
                placeholder={t("form.tags")}
                aria-label={t("form.tags")}
                value={tagInput}
                onChange={(e) => {
                  const v = e.target.value;
                  // Picking a value from the datalist fires change with the full option.
                  if (allTags.includes(v)) addTag(v);
                  else setTagInput(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); }
                }}
              />
              <datalist id="tagFilterOptions">
                {allTags.filter((tg) => !q.tags.includes(tg)).map((tg) => (
                  <option key={tg} value={tg} />
                ))}
              </datalist>
            </>
          )}
        </span>
        <select value={q.hourType} onChange={(e) => setQ({ ...q, hourType: e.target.value })} aria-label={t("form.hourType")}>
          <option value="">{t("form.hourType")}</option>
          <option value="HO">{t("form.hoLong")}</option>
          <option value="HNO">{t("form.hnoLong")}</option>
        </select>
        <input type="date" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} aria-label={t("filter.from")} />
        <input type="date" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} aria-label={t("filter.to")} />
        {(q.version || q.requester || q.tags.length > 0 || q.hourType || q.from || q.to) && (
          <button type="button" onClick={() => { setQ({ version: "", requester: "", tags: [], hourType: "", from: "", to: "" }); setTagInput(""); }}>{t("detail.reset")}</button>
        )}
      </div>

      {nothing ? (
        <p className={styles.empty}>{t("detail.empty")}</p>
      ) : (
        <>
          {maintenancesToShow.length > 0 && (
            <div className={styles.month}>
              <div className={styles.monthLabel}>{t("detail.maintenances")}</div>
              {maintenancesToShow.map((e) => (
                <TimelineRow
                  key={e.id}
                  entry={e}
                  onClick={() => setSelected(e.eventId)}
                  lotMembers={e.lot ? siblings(lotMembers[lotKey(e.environment, e.lot)] ?? [], e.eventId) : []}
                  lotWarning={e.lot ? (lotWarnings[lotKey(e.environment, e.lot)] ?? []) : []}
                  envColor={showEnvBadge ? (envColors[e.environment] ?? "#64748b") : null}
                  tagColors={tagColors}
                />
              ))}
            </div>
          )}
          {maintenancesToShow.length > 0 && groups.length > 0 && <hr className={styles.divider} />}
          {groups.map((g) => (
            <div key={g.key} className={styles.month}>
              <div className={styles.monthLabel}>{g.label}</div>
              {g.entries.map((e) => (
                <TimelineRow
                  key={e.id}
                  entry={e}
                  onClick={() => setSelected(e.eventId)}
                  lotMembers={e.lot ? siblings(lotMembers[lotKey(e.environment, e.lot)] ?? [], e.eventId) : []}
                  lotWarning={e.lot ? (lotWarnings[lotKey(e.environment, e.lot)] ?? []) : []}
                  envColor={showEnvBadge ? (envColors[e.environment] ?? "#64748b") : null}
                  tagColors={tagColors}
                />
              ))}
            </div>
          ))}
        </>
      )}

      {selectedEvent && (
        <EventDrawer
          key={selectedEvent.id}
          event={selectedEvent}
          all={events}
          path={path}
          onClose={() => setSelected(null)}
          lotMembers={selectedEvent?.lot ? siblings(lotMembers[lotKey(selectedEvent.environment, selectedEvent.lot)] ?? [], selectedEvent.id) : []}
          lotWarning={selectedEvent?.lot ? (lotWarnings[lotKey(selectedEvent.environment, selectedEvent.lot)] ?? []) : []}
          buildUrlTemplate={buildUrlTemplate}
          envWorkflow={envWorkflow}
          envColors={envColors}
          canWrite={canWrite}
          onNewPhase={(changeType, parentId) => {
            const parent = events.find((e) => e.id === parentId);
            setPhaseDefaults({ changeType, parentId, environment: parent?.environment ?? "", parentOccurredAt: parent?.occurredAt ?? "" });
          }}
          onOpenEvent={(id) => setSelected(id)}
        />
      )}
      {modal && (
        <EventModal company={company} product={product} service={service} path={path} mepCandidates={mepCandidates} onClose={() => setModal(false)} />
      )}
      {phaseDefaults && (
        <EventModal
          company={company} product={product} service={service} path={path}
          mepCandidates={mepCandidates}
          defaultChangeType={phaseDefaults.changeType}
          defaultParentId={phaseDefaults.parentId}
          defaultEnvironment={phaseDefaults.environment}
          parentOccurredAt={phaseDefaults.parentOccurredAt}
          title={t("form.newPhase", { type: changeTypeLabel(t, phaseDefaults.changeType) })}
          onClose={() => setPhaseDefaults(null)}
        />
      )}
      {lotModal && (
        <LotModal path={path} company={company} onClose={() => setLotModal(false)} />
      )}
    </div>
  );
}

function Counter({ n, label, cat }: { n: number; label: string; cat: EntryCategory }) {
  return (
    <div className={styles.counter}>
      <span className="catBadge" data-cat={cat} style={{ background: "none" }}>{n}</span>
      <span className={styles.counterLabel}>{label}</span>
    </div>
  );
}
