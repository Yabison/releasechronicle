import { describe, it, expect } from "vitest";
import { createRateLimiter } from "@/lib/rateLimit";

const opts = { limit: 3, windowMs: 60_000 };

describe("createRateLimiter", () => {
  it("allows a key that has never failed", () => {
    const rl = createRateLimiter(opts);
    expect(rl.check("bob", 0).allowed).toBe(true);
  });

  it("blocks once the failure limit is reached inside the window", () => {
    const rl = createRateLimiter(opts);
    for (let i = 0; i < 3; i++) rl.fail("bob", 0);
    const res = rl.check("bob", 0);
    expect(res.allowed).toBe(false);
    expect(res.retryAfterSeconds).toBe(60);
  });

  it("still allows the key one attempt below the limit", () => {
    const rl = createRateLimiter(opts);
    rl.fail("bob", 0);
    rl.fail("bob", 0);
    expect(rl.check("bob", 0).allowed).toBe(true);
  });

  it("forgets failures that fall out of the window", () => {
    const rl = createRateLimiter(opts);
    for (let i = 0; i < 3; i++) rl.fail("bob", 0);
    expect(rl.check("bob", 59_999).allowed).toBe(false);
    expect(rl.check("bob", 60_001).allowed).toBe(true);
  });

  it("counts down retryAfter as the window elapses", () => {
    const rl = createRateLimiter(opts);
    for (let i = 0; i < 3; i++) rl.fail("bob", 0);
    expect(rl.check("bob", 30_000).retryAfterSeconds).toBe(30);
  });

  it("clears the count on a successful login", () => {
    const rl = createRateLimiter(opts);
    for (let i = 0; i < 3; i++) rl.fail("bob", 0);
    rl.reset("bob");
    expect(rl.check("bob", 0).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const rl = createRateLimiter(opts);
    for (let i = 0; i < 3; i++) rl.fail("bob", 0);
    expect(rl.check("alice", 0).allowed).toBe(true);
  });

  it("drops expired keys instead of growing forever", () => {
    const rl = createRateLimiter(opts);
    rl.fail("bob", 0);
    rl.fail("alice", 0);
    expect(rl.size()).toBe(2);
    rl.fail("carol", 60_001);
    expect(rl.size()).toBe(1);
  });
});
