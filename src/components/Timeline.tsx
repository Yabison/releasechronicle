"use client";

import type { ClientEvent } from "@/lib/timeline";
import { groupByDay, eventAppearance } from "@/lib/timeline";
import styles from "./Timeline.module.css";

export function Timeline({ events, onSelect }: { events: ClientEvent[]; onSelect: (e: ClientEvent) => void }) {
  const groups = groupByDay(events);
  if (groups.length === 0) return <p className={styles.empty}>No events.</p>;
  return (
    <div>
      {groups.map((g) => (
        <div key={g.day} className={styles.day}>
          <div className={styles.dayLabel}>{g.day}</div>
          {g.events.map((e) => {
            const a = eventAppearance(e);
            return (
              <div key={e.id} className={styles.row} onClick={() => onSelect(e)}>
                <span className={`${styles.dot} ${styles[a.color]} ${a.striped ? styles.striped : ""}`} />
                <span className={styles.time}>{e.occurredAt.slice(11, 16)}</span>
                <span>{a.label}</span>
                {a.badge && <span className={styles.badge}>{a.badge}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
