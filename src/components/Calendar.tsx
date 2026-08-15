"use client";

import { useState } from "react";
import type { ClientEvent } from "@/lib/timeline";
import { calendarCells, eventAppearance } from "@/lib/timeline";
import styles from "./Calendar.module.css";
import { useI18n } from "@/i18n/useI18n";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function latestMonth(events: ClientEvent[]): { year: number; month: number } {
  const iso = events[0]?.occurredAt ?? new Date().toISOString();
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

export function Calendar({ events, onSelect }: { events: ClientEvent[]; onSelect: (e: ClientEvent) => void }) {
  const { t } = useI18n();
  const [{ year, month }, setYM] = useState(() => latestMonth(events));
  const weeks = calendarCells(events, year, month);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYM({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  };

  return (
    <div>
      <div className={styles.head}>
        <button onClick={() => shift(-1)} aria-label={t("cal.prevMonth")}>‹</button>
        <strong>{year}-{String(month).padStart(2, "0")}</strong>
        <button onClick={() => shift(1)} aria-label={t("cal.nextMonth")}>›</button>
      </div>
      <div className={styles.grid}>
        {DOW.map((d) => <div key={d} className={styles.dow}>{d}</div>)}
        {weeks.flat().map((c) => (
          <div
            key={c.date}
            className={`${styles.cell} ${c.outside ? styles.outside : ""} ${c.maintenances.length ? styles.maint : ""}`}
          >
            <div className={styles.date}>{Number(c.date.slice(8, 10))}</div>
            {c.events.map((e) => {
              const a = eventAppearance(e);
              return (
                <span
                  key={e.id}
                  className={`${styles.marker} ${styles[a.color] ?? ""}`}
                  title={a.label}
                  onClick={() => onSelect(e)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
