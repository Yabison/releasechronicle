export type MaintenanceStatus = "Upcoming" | "InProgress" | "Complete";

export function maintenanceStatus(
  windowStart: Date,
  windowEnd: Date,
  now: Date,
): MaintenanceStatus {
  if (now < windowStart) return "Upcoming";
  if (now > windowEnd) return "Complete";
  return "InProgress";
}

export function incidentDuration(
  startedAt: Date,
  resolvedAt: Date | null,
  now: Date,
): { minutes: number; open: boolean } {
  const end = resolvedAt ?? now;
  const minutes = Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 60000));
  return { minutes, open: resolvedAt === null };
}

export type DurationParts = {
  totalSeconds: number;
  totalMinutes: number;
  totalHours: number;
  totalDays: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Human label like "2j 03h 04m 05s" (omits leading zero units). */
  label: string;
};

/** Break an elapsed span (from → to) into seconds/minutes/hours/days, total and components. */
export function durationParts(from: Date, to: Date): DurationParts {
  const totalSeconds = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}j`);
  if (days > 0 || hours > 0) parts.push(`${String(hours).padStart(2, "0")}h`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${String(minutes).padStart(2, "0")}m`);
  parts.push(`${String(seconds).padStart(2, "0")}s`);
  return {
    totalSeconds,
    totalMinutes: Math.floor(totalSeconds / 60),
    totalHours: Math.floor(totalSeconds / 3600),
    totalDays: Math.floor(totalSeconds / 86400),
    days, hours, minutes, seconds,
    label: parts.join(" "),
  };
}

export function currentByEnvironment<T extends { environment: string; occurredAt: Date }>(
  deployments: T[],
): Record<string, T> {
  const current: Record<string, T> = {};
  for (const d of deployments) {
    const seen = current[d.environment];
    if (!seen || d.occurredAt > seen.occurredAt) current[d.environment] = d;
  }
  return current;
}
