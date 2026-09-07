/** Retry schedule for hook deliveries. Attempt 1 is the immediate post-enqueue send. */
export const MAX_ATTEMPTS = 6;

const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000] as const;

/** Delay before the next try after `attempts` tries so far, or null when exhausted. */
export function nextAttemptDelayMs(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
}
