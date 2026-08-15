import styles from "./CurrentBand.module.css";

type Current = Record<string, { version: string | null } | undefined>;
const ENVS = ["PROD", "PREPROD", "QA", "DEV"];

/** Per-environment version for a single service. Shows all environments, "—" when undeployed. */
export function CurrentBand({ current }: { current: Current }) {
  return (
    <div className={styles.band}>
      {ENVS.map((env) => (
        <div key={env} className={styles.cell}>
          <div className={styles.env}>{env}</div>
          <div className={styles.ver}>{current[env]?.version ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

/** Service × environment matrix for a product. */
export function CurrentMatrix({ rows }: { rows: { service: string; current: Current }[] }) {
  if (rows.length === 0) return null;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Service</th>
          {ENVS.map((e) => <th key={e}>{e}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.service}>
            <td>{r.service}</td>
            {ENVS.map((e) => <td key={e}>{r.current[e]?.version ?? "—"}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
