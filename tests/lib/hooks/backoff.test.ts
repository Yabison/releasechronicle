import { describe, it, expect } from "vitest";
import { MAX_ATTEMPTS, nextAttemptDelayMs } from "@/lib/hooks/backoff";

describe("hook retry backoff", () => {
  it("walks the 1m/5m/30m/2h/6h ladder by attempt count", () => {
    expect(nextAttemptDelayMs(1)).toBe(60_000);
    expect(nextAttemptDelayMs(2)).toBe(300_000);
    expect(nextAttemptDelayMs(3)).toBe(1_800_000);
    expect(nextAttemptDelayMs(4)).toBe(7_200_000);
    expect(nextAttemptDelayMs(5)).toBe(21_600_000);
  });
  it("returns null once attempts reach the cap", () => {
    expect(MAX_ATTEMPTS).toBe(6);
    expect(nextAttemptDelayMs(6)).toBeNull();
    expect(nextAttemptDelayMs(7)).toBeNull();
  });
});
