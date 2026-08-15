import { describe, it, expect, afterEach } from "vitest";
import { isMailerConfigured } from "@/lib/mailer";

afterEach(() => { delete process.env.SMTP_HOST; delete process.env.SMTP_FROM; });

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
