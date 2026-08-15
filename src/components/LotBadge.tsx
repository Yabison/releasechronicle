"use client";

import type { LotMember } from "@/lib/deployLot";
import { STATUS_META } from "@/lib/deployStatusMeta";
import type { DeployStatus } from "@prisma/client";
import styles from "./LotBadge.module.css";

export function LotBadge({ members }: { members: LotMember[] }) {
  if (members.length === 0) return null;
  return (
    <span className={styles.wrap} tabIndex={0} aria-label={`Lot : ${members.length} autre(s) déploiement(s)`}>
      <span className={styles.icon}>📦</span>
      <span className={styles.tip} role="tooltip">
        {members.map((m) => (
          <span key={m.eventId} className={styles.row}>
            <span className={styles.name}>{m.product} / {m.service}</span>
            <span className={styles.ver}>{m.version ? `v${m.version}` : ""}</span>
            <span className={styles.env}>{m.environment}</span>
            {m.deployStatus && (
              <span className={styles.pill} style={{ background: STATUS_META[m.deployStatus as DeployStatus].color }}>
                {STATUS_META[m.deployStatus as DeployStatus].label}
              </span>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
