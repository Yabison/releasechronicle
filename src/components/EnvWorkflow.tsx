import { envStepStates } from "@/lib/envWorkflow";
import styles from "./EnvWorkflow.module.css";

export function EnvWorkflow({
  workflow,
  current,
  colors,
}: {
  workflow: string[];
  current: string;
  colors: Record<string, string>;
}) {
  if (workflow.length === 0) return null;
  const steps = envStepStates(workflow, current);
  return (
    <div className={styles.wrap}>
      {steps.map((s, i) => (
        <span key={s.env} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            className={`${styles.step} ${s.state === "current" ? styles.current : ""} ${s.state === "upcoming" ? styles.upcoming : ""}`}
            style={{
              background: s.state === "upcoming" ? "transparent" : colors[s.env] ?? "#64748b",
              color: s.state === "upcoming" ? (colors[s.env] ?? "#64748b") : "#fff",
              borderColor: s.state === "current" ? "#111827" : "transparent",
            }}
          >
            {s.env}
          </span>
          {i < steps.length - 1 && <span className={styles.sep}>→</span>}
        </span>
      ))}
    </div>
  );
}
