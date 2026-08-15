export type DoraDeploy = { occurredAt: string; deployedAt: string | null; rolledBack: boolean };
export type DoraIncident = { startedAt: string; resolvedAt: string | null };
export type DoraBand = "elite" | "high" | "medium" | "low" | "na";

export type DoraMetrics = {
  windowDays: number;
  deploy: { count: number; perDay: number; band: DoraBand };
  leadTime: { medianMs: number | null; sample: number; band: DoraBand };
  changeFailure: { rate: number | null; failures: number; total: number; band: DoraBand };
  mttr: { medianMs: number | null; sample: number; band: DoraBand };
};

const H = 3600_000, D = 24 * H;

/** Median of a numeric list; null when empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function deployBand(perDay: number): DoraBand {
  if (perDay <= 0) return "na";
  if (perDay >= 1) return "elite";
  if (perDay >= 1 / 7) return "high";
  if (perDay >= 1 / 30) return "medium";
  return "low";
}
function durationBand(ms: number | null): DoraBand {
  if (ms === null) return "na";
  if (ms <= H) return "elite";
  if (ms <= D) return "high";
  if (ms <= 7 * D) return "medium";
  return "low";
}
function failureBand(rate: number | null, total: number): DoraBand {
  if (rate === null || total === 0) return "na";
  if (rate <= 0.05) return "elite";
  if (rate <= 0.1) return "high";
  if (rate <= 0.15) return "medium";
  return "low";
}

const ms = (iso: string) => new Date(iso).getTime();

export function computeDora(deploys: DoraDeploy[], incidents: DoraIncident[], windowDays: number): DoraMetrics {
  const days = Math.max(windowDays, 1);
  const leads = deploys.filter((d) => d.deployedAt).map((d) => ms(d.deployedAt!) - ms(d.occurredAt));
  const restores = incidents.filter((i) => i.resolvedAt).map((i) => ms(i.resolvedAt!) - ms(i.startedAt));
  const failures = deploys.filter((d) => d.rolledBack).length;
  const total = deploys.length;
  const leadMedian = median(leads);
  const mttrMedian = median(restores);
  const rate = total ? failures / total : null;
  const perDay = total / days;
  return {
    windowDays: days,
    deploy: { count: total, perDay, band: deployBand(perDay) },
    leadTime: { medianMs: leadMedian, sample: leads.length, band: durationBand(leadMedian) },
    changeFailure: { rate, failures, total, band: failureBand(rate, total) },
    mttr: { medianMs: mttrMedian, sample: restores.length, band: durationBand(mttrMedian) },
  };
}
