import { describe, it, expect } from "vitest";
import { formatDuration } from "@/lib/duration";

describe("formatDuration", () => {
  it("sub-minute", () => expect(formatDuration(30_000)).toBe("< 1 min"));
  it("minutes", () => expect(formatDuration(15 * 60_000)).toBe("15 min"));
  it("hours + minutes", () => expect(formatDuration(2 * 3600_000 + 15 * 60_000)).toBe("2h 15m"));
  it("days + hours", () => expect(formatDuration(3 * 86_400_000 + 4 * 3600_000)).toBe("3j 4h"));
  it("null", () => expect(formatDuration(null)).toBe("—"));
});
