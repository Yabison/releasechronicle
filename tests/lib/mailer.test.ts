import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isMailerConfigured } from "@/lib/mailer";

// Cleaning up afterwards was not enough: the first case inherited whatever the
// machine had, and .env sets SMTP_HOST for the Mailpit dev stack that
// docs/dev-environment.md tells everyone to run. The suite passed in CI, which
// has no .env, and failed on every developer's box.
const clear = () => { delete process.env.SMTP_HOST; delete process.env.SMTP_FROM; };
beforeEach(clear);
afterEach(clear);

describe("isMailerConfigured", () => {
  it("is false when SMTP env is missing", () => {
    expect(isMailerConfigured()).toBe(false);
  });
  it("is true when host and from are set", () => {
    process.env.SMTP_HOST = "smtp.example";
    process.env.SMTP_FROM = "rc@example";
    expect(isMailerConfigured()).toBe(true);
  });
});
