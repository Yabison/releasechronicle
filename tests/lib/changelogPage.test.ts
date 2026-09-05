import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { upsertChangelogFromCi, setManualChangelog } from "@/lib/changelog";
import { setChangelogVisibility } from "@/lib/visibility";
import { loadServiceChangelog } from "@/lib/changelogPage";
import type { SessionUser } from "@/lib/auth/session";

const AUTH: SessionUser = { sub: "u1", name: "Dev", roles: ["devops"] };
const ARGS = { company: "acme", product: "checkout", service: "api" };

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

async function seed({ isPublic = false }: { isPublic?: boolean } = {}) {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  if (isPublic) {
    await prisma.company.update({ where: { id: c.id }, data: { public: true } });
    await prisma.product.update({ where: { id: p.id }, data: { public: true } });
    await prisma.service.update({ where: { id: s.id }, data: { public: true } });
  }
  return s.id;
}

describe("loadServiceChangelog", () => {
  it("renders every note newest-first, sanitized", async () => {
    const serviceId = await seed();
    await upsertChangelogFromCi(serviceId, "1.0.0", "vieille");
    await upsertChangelogFromCi(serviceId, "2.0.0", "### Récente\n<script>alert(1)</script>");

    const page = await loadServiceChangelog({ ...ARGS, session: AUTH });

    expect(page?.notes.map((n) => n.version)).toEqual(["2.0.0", "1.0.0"]);
    expect(page?.notes[0].html).toContain("<h3>Récente</h3>");
    expect(page?.notes[0].html).not.toContain("<script");
  });

  it("marks a hand-edited note with its author", async () => {
    const serviceId = await seed();
    await setManualChangelog(serviceId, "1.0.0", "à la main", "Hervé");

    const page = await loadServiceChangelog({ ...ARGS, session: AUTH });

    expect(page?.notes[0]).toMatchObject({ source: "UI", authorName: "Hervé" });
  });

  it("returns an empty list for a service with no note", async () => {
    await seed();
    expect((await loadServiceChangelog({ ...ARGS, session: AUTH }))?.notes).toEqual([]);
  });

  it("returns null for an unknown service", async () => {
    await seed();
    expect(await loadServiceChangelog({ ...ARGS, service: "ghost", session: AUTH })).toBeNull();
  });

  it("returns null to an anonymous reader in AUTHENTICATED mode", async () => {
    const serviceId = await seed({ isPublic: true });
    await upsertChangelogFromCi(serviceId, "1.0.0", "note");

    expect(await loadServiceChangelog({ ...ARGS, session: null })).toBeNull();
  });

  it("serves an anonymous reader in PUBLIC mode when the chain is public", async () => {
    const serviceId = await seed({ isPublic: true });
    await upsertChangelogFromCi(serviceId, "1.0.0", "note");
    await setChangelogVisibility("PUBLIC");

    expect((await loadServiceChangelog({ ...ARGS, session: null }))?.notes).toHaveLength(1);
  });

  // Le réglage ne fait que retirer : il n'ouvre jamais un service privé.
  it("returns null to an anonymous reader in PUBLIC mode when the service is private", async () => {
    const serviceId = await seed({ isPublic: false });
    await upsertChangelogFromCi(serviceId, "1.0.0", "note");
    await setChangelogVisibility("PUBLIC");

    expect(await loadServiceChangelog({ ...ARGS, session: null })).toBeNull();
  });
});
