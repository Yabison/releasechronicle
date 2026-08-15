/** Compact human duration: "< 1 min", "15 min", "2h 15m", "3j 4h". null → "—". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return "< 1 min";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}j ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins} min`;
}
