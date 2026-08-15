import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/** Minutes before scheduledAt that a SCHEDULED deploy is promoted to PENDING. Default 15. */
export function scheduledLeadMinutes(): number {
  try {
    const file = process.env.DEPLOY_CONFIG_FILE ?? join(process.cwd(), "config", "deploy.yml");
    const y = (parse(readFileSync(file, "utf8")) ?? {}) as { scheduledLeadMinutes?: unknown };
    const n = Number(y.scheduledLeadMinutes);
    return Number.isFinite(n) && n >= 0 ? n : 15;
  } catch {
    return 15;
  }
}

/** Time window (minutes) used to group deployments into the same auto lot. Default 30. */
export function autoLotWindowMinutes(): number {
  try {
    const file = process.env.DEPLOY_CONFIG_FILE ?? join(process.cwd(), "config", "deploy.yml");
    const y = (parse(readFileSync(file, "utf8")) ?? {}) as { autoLotWindowMinutes?: unknown };
    const n = Number(y.autoLotWindowMinutes);
    return Number.isFinite(n) && n >= 0 ? n : 30;
  } catch {
    return 30;
  }
}
