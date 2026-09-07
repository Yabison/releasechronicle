import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import {
  listChangelogs, getChangelog, upsertChangelogFromCi,
  setManualChangelog, releaseChangelogToCi,
} from "@/lib/changelog";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

async function seedService() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  return (await createService({ productId: p.id, name: "API", type: "API" })).id;
}

describe("upsertChangelogFromCi", () => {
  it("creates the note on the first deployment of a version", async () => {
    const serviceId = await seedService();
    const r = await upsertChangelogFromCi(serviceId, "1.0.0", "### Ajouté\n- le tri");
    expect(r.written).toBe(true);
    expect((await getChangelog(serviceId, "1.0.0"))?.body).toContain("le tri");
  });

  it("overwrites a note the CI itself wrote", async () => {
    const serviceId = await seedService();
    await upsertChangelogFromCi(serviceId, "1.0.0", "première");
    const r = await upsertChangelogFromCi(serviceId, "1.0.0", "corrigée");
    expect(r.written).toBe(true);
    expect((await getChangelog(serviceId, "1.0.0"))?.body).toBe("corrigée");
  });

  // L'invariant central : une promotion d'environnement rejoue le même payload.
  it("refuses to overwrite a note edited by hand", async () => {
    const serviceId = await seedService();
    await upsertChangelogFromCi(serviceId, "1.0.0", "de la CI");
    await setManualChangelog(serviceId, "1.0.0", "corrigée à la main", "Hervé");

    const r = await upsertChangelogFromCi(serviceId, "1.0.0", "la CI réessaie");

    expect(r.written).toBe(false);
    const row = await getChangelog(serviceId, "1.0.0");
    expect(row?.body).toBe("corrigée à la main");
    expect(row?.source).toBe("UI");
  });
});

describe("setManualChangelog", () => {
  it("locks the note and records its author", async () => {
    const serviceId = await seedService();
    const row = await setManualChangelog(serviceId, "2.0.0", "écrite à la main", "Hervé");
    expect(row.source).toBe("UI");
    expect(row.authorName).toBe("Hervé");
  });
});

describe("releaseChangelogToCi", () => {
  it("hands the version back, so the next deployment writes again", async () => {
    const serviceId = await seedService();
    await setManualChangelog(serviceId, "1.0.0", "à la main", "Hervé");

    await releaseChangelogToCi(serviceId, "1.0.0");
    const r = await upsertChangelogFromCi(serviceId, "1.0.0", "de la CI");

    expect(r.written).toBe(true);
    expect((await getChangelog(serviceId, "1.0.0"))?.body).toBe("de la CI");
  });

  it("clears the author along with the lock", async () => {
    const serviceId = await seedService();
    await setManualChangelog(serviceId, "1.0.0", "à la main", "Hervé");

    const row = await releaseChangelogToCi(serviceId, "1.0.0");

    expect(row?.source).toBe("CI");
    expect(row?.authorName).toBeNull();
  });

  it("returns null for a version that has no note", async () => {
    const serviceId = await seedService();
    expect(await releaseChangelogToCi(serviceId, "9.9.9")).toBeNull();
  });
});

describe("listChangelogs", () => {
  it("returns the newest release first", async () => {
    const serviceId = await seedService();
    await upsertChangelogFromCi(serviceId, "1.0.0", "vieille");
    await upsertChangelogFromCi(serviceId, "2.0.0", "récente");
    expect((await listChangelogs(serviceId)).map((r) => r.version)).toEqual(["2.0.0", "1.0.0"]);
  });

  it("is empty for a service that has none", async () => {
    expect(await listChangelogs(await seedService())).toEqual([]);
  });
});
