import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { scheduledLeadMinutes, autoLotWindowMinutes } from "@/lib/deployConfig";

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
