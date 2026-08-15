import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { listEnvironments, getActiveEnvSlugs, createEnvironment, updateEnvironment, softDeleteEnvironment, resolveEnvColorMap } from "@/lib/environment";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("environment lib", () => {
  it("creates with slugified name and appended sortOrder", async () => {
    const a = await createEnvironment({ name: "Staging Zone", color: "#111111" });
    expect(a.slug).toBe("staging-zone");
    expect(a.sortOrder).toBe(0);
    const b = await createEnvironment({ name: "Canary", color: "#222222" });
    expect(b.sortOrder).toBe(1);
    expect((await listEnvironments()).map((e) => e.slug)).toEqual(["staging-zone", "canary"]);
    expect(await getActiveEnvSlugs()).toContain("canary");
  });
  it("updates name/color/order", async () => {
    const a = await createEnvironment({ name: "Alpha", color: "#111111" });
    const u = await updateEnvironment(a.id, { name: "Alpha 2", color: "#999999", sortOrder: 5 });
    expect(u.name).toBe("Alpha 2");
    expect(u.color).toBe("#999999");
    expect(u.sortOrder).toBe(5);
  });
  it("soft-delete removes from active list + slugs but keeps the row", async () => {
    const a = await createEnvironment({ name: "Temp", color: "#111111" });
    await softDeleteEnvironment(a.id);
    expect((await listEnvironments()).some((e) => e.id === a.id)).toBe(false);
    expect(await getActiveEnvSlugs()).not.toContain("temp");
    expect(await prisma.environmentConfig.findUnique({ where: { id: a.id } })).not.toBeNull();
  });
  it("resolveEnvColorMap maps active slug → color", async () => {
    await createEnvironment({ name: "Prodlike", color: "#abcdef" });
    expect((await resolveEnvColorMap())["prodlike"]).toBe("#abcdef");
  });
});
