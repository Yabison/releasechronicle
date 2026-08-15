/** A readable default lot number, e.g. "LOT-20260806-1423" (local time). */
export function defaultLotNumber(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `LOT-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}
