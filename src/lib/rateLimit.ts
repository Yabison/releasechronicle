/**
 * Fixed-window failure counter, used to slow down password guessing.
 *
 * In-process by design: it protects a single instance and needs no extra service.
 * Behind several replicas each holds its own counter, so the effective limit is
 * `limit × replicas` — enough to stop a naive brute force, not a distributed one.
 * Move the store to Redis if that becomes the threat.
 *
 * `now` is a parameter rather than a `Date.now()` call so the window is testable.
 */
export type RateLimitVerdict = { allowed: boolean; retryAfterSeconds: number };

export type RateLimiter = {
  check(key: string, now: number): RateLimitVerdict;
  fail(key: string, now: number): void;
  reset(key: string): void;
  size(): number;
};

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const windows = new Map<string, { count: number; startedAt: number }>();

  const live = (key: string, now: number) => {
    const w = windows.get(key);
    if (!w) return undefined;
    if (now - w.startedAt >= windowMs) {
      windows.delete(key);
      return undefined;
    }
    return w;
  };

  return {
    check(key, now) {
      const w = live(key, now);
      if (!w || w.count < limit) return { allowed: true, retryAfterSeconds: 0 };
      return { allowed: false, retryAfterSeconds: Math.ceil((windowMs - (now - w.startedAt)) / 1000) };
    },
    fail(key, now) {
      // Sweep on write: expired keys of *other* users would otherwise pile up
      // forever, since nothing else revisits them.
      for (const [k, w] of windows) if (now - w.startedAt >= windowMs) windows.delete(k);
      const w = live(key, now);
      if (w) w.count += 1;
      else windows.set(key, { count: 1, startedAt: now });
    },
    reset(key) {
      windows.delete(key);
    },
    size() {
      return windows.size;
    },
  };
}
