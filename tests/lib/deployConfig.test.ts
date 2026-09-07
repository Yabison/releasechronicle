import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { scheduledLeadMinutes, autoLotWindowMinutes, calendarPastDays, calendarFutureDays } from "@/lib/deployConfig";

const FIX = join(process.cwd(), "config", "deploy.test.yml");
afterEach(() => { try { rmSync(FIX); } catch {} delete process.env.DEPLOY_CONFIG_FILE; });

describe("scheduledLeadMinutes", () => {
  it("defaults to 15 when the file is missing", () => {
    process.env.DEPLOY_CONFIG_FILE = join(process.cwd(), "config", "does-not-exist.yml");
    expect(scheduledLeadMinutes()).toBe(15);
  });
  it("reads the configured value", () => {
    writeFileSync(FIX, "scheduledLeadMinutes: 30\n");
    process.env.DEPLOY_CONFIG_FILE = FIX;
    expect(scheduledLeadMinutes()).toBe(30);
  });
});

describe("autoLotWindowMinutes", () => {
  it("defaults to 30 when the file is missing", () => {
    process.env.DEPLOY_CONFIG_FILE = join(process.cwd(), "config", "does-not-exist.yml");
    expect(autoLotWindowMinutes()).toBe(30);
  });
  it("reads the configured value", () => {
    writeFileSync(FIX, "autoLotWindowMinutes: 10\n");
    process.env.DEPLOY_CONFIG_FILE = FIX;
    expect(autoLotWindowMinutes()).toBe(10);
  });
});

describe("calendarPastDays", () => {
  it("defaults to 90 when the file is missing", () => {
    process.env.DEPLOY_CONFIG_FILE = join(process.cwd(), "config", "does-not-exist.yml");
    expect(calendarPastDays()).toBe(90);
  });
  it("reads the configured value", () => {
    writeFileSync(FIX, "calendarPastDays: 7\n");
    process.env.DEPLOY_CONFIG_FILE = FIX;
    expect(calendarPastDays()).toBe(7);
  });
});

describe("calendarFutureDays", () => {
  it("defaults to 365 when the file is missing", () => {
    process.env.DEPLOY_CONFIG_FILE = join(process.cwd(), "config", "does-not-exist.yml");
    expect(calendarFutureDays()).toBe(365);
  });
  it("reads the configured value", () => {
    writeFileSync(FIX, "calendarFutureDays: 30\n");
    process.env.DEPLOY_CONFIG_FILE = FIX;
    expect(calendarFutureDays()).toBe(30);
  });
});
