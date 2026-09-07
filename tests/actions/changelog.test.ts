import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));
const session = vi.hoisted(() => ({ user: null as null | { sub: string; name: string; roles: string[] } }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<object>()),
  getSession: async () => session.user,
}));

import { setChangelogAction, releaseChangelogAction, loadChangelogAction } from "@/app/actions/changelog";
import { getChangelog, upsertChangelogFromCi } from "@/lib/changelog";
import { setChangelogVisibility } from "@/lib/visibility";

const ARGS = { company: "acme", product: "checkout", service: "api", version: "1.0.0", path: "/" };

beforeEach(async () => {
  await resetDb();
  session.user = { sub: "u", name: "Hervé", roles: ["devops"] };
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  await createService({ productId: p.id, name: "API", type: "API" });
});
afterAll(async () => { await prisma.$disconnect(); });

const serviceId = async () => (await prisma.service.findFirstOrThrow({ where: { slug: "api" } })).id;

describe("setChangelogAction", () => {
  it("writes the note, locks it and names its author", async () => {
    expect(await setChangelogAction({ ...ARGS, body: "à la main" })).toEqual({ ok: true });
    const row = await getChangelog(await serviceId(), "1.0.0");
    expect(row?.body).toBe("à la main");
    expect(row?.source).toBe("UI");
    expect(row?.authorName).toBe("Hervé");
  });

  it("takes over a note the CI had written", async () => {
    await upsertChangelogFromCi(await serviceId(), "1.0.0", "de la CI");
    await setChangelogAction({ ...ARGS, body: "corrigée" });
    const row = await getChangelog(await serviceId(), "1.0.0");
    expect(row?.body).toBe("corrigée");
    expect(row?.source).toBe("UI");
  });

  it("refuses an anonymous caller", async () => {
    session.user = null;
    expect(await setChangelogAction({ ...ARGS, body: "x" })).toEqual({ ok: false, error: "err.loginRequired" });
    expect(await getChangelog(await serviceId(), "1.0.0")).toBeNull();
  });

  it("refuses a read-only role", async () => {
    session.user = { sub: "u", name: "Read", roles: ["qa"] };
    const res = await setChangelogAction({ ...ARGS, body: "x" });
    expect(res.ok).toBe(false);
    expect(await getChangelog(await serviceId(), "1.0.0")).toBeNull();
  });

  it("refuses an unknown service", async () => {
    const res = await setChangelogAction({ ...ARGS, service: "ghost", body: "x" });
    expect(res).toEqual({ ok: false, error: "err.serviceNotFound" });
  });

  it("refuses a body over the cap", async () => {
    const res = await setChangelogAction({ ...ARGS, body: "x".repeat(20_001) });
    expect(res.ok).toBe(false);
    expect(await getChangelog(await serviceId(), "1.0.0")).toBeNull();
  });

  it("refuses an empty body rather than storing a blank note", async () => {
    const res = await setChangelogAction({ ...ARGS, body: "   " });
    expect(res.ok).toBe(false);
  });

  it("records the write in the audit trail", async () => {
    await setChangelogAction({ ...ARGS, body: "à la main" });
    const rows = await prisma.auditLog.findMany({ where: { action: "changelog.set" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe("Hervé");
    expect(rows[0].target).toBe("acme/checkout/api@1.0.0");
  });
});

describe("releaseChangelogAction", () => {
  it("hands the version back to the CI", async () => {
    await setChangelogAction({ ...ARGS, body: "à la main" });
    expect(await releaseChangelogAction(ARGS)).toEqual({ ok: true });
    expect((await getChangelog(await serviceId(), "1.0.0"))?.source).toBe("CI");
  });

  it("refuses an anonymous caller", async () => {
    session.user = null;
    expect(await releaseChangelogAction(ARGS)).toEqual({ ok: false, error: "err.loginRequired" });
  });
});

describe("loadChangelogAction", () => {
  it("renders every note newest-first for a signed-in reader", async () => {
    await upsertChangelogFromCi(await serviceId(), "1.0.0", "vieille");
    await upsertChangelogFromCi(await serviceId(), "2.0.0", "### Récente");

    const res = await loadChangelogAction({ company: "acme", product: "checkout", service: "api" });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.notes.map((n) => n.version)).toEqual(["2.0.0", "1.0.0"]);
    expect(res.notes[0].html).toContain("<h3>Récente</h3>");
  });

  it("serves a reader with no write role — reading is not writing", async () => {
    session.user = { sub: "u", name: "Read", roles: ["qa"] };
    await upsertChangelogFromCi(await serviceId(), "1.0.0", "note");

    const res = await loadChangelogAction({ company: "acme", product: "checkout", service: "api" });

    expect(res.ok).toBe(true);
  });

  it("answers an empty list for a service with no note", async () => {
    const res = await loadChangelogAction({ company: "acme", product: "checkout", service: "api" });
    expect(res).toEqual({ ok: true, notes: [] });
  });

  // Une seule sortie pour « n'existe pas » et « pas le droit » : les distinguer
  // dirait déjà que le service existe.
  it("refuses an unknown service", async () => {
    const res = await loadChangelogAction({ company: "acme", product: "checkout", service: "ghost" });
    expect(res).toEqual({ ok: false, error: "err.serviceNotFound" });
  });

  it("refuses an anonymous caller in AUTHENTICATED mode, with the same answer", async () => {
    session.user = null;
    await prisma.company.updateMany({ data: { public: true } });
    await prisma.product.updateMany({ data: { public: true } });
    await prisma.service.updateMany({ data: { public: true } });
    await upsertChangelogFromCi(await serviceId(), "1.0.0", "note");

    const res = await loadChangelogAction({ company: "acme", product: "checkout", service: "api" });

    expect(res).toEqual({ ok: false, error: "err.serviceNotFound" });
  });

  it("serves an anonymous caller in PUBLIC mode when the chain is public", async () => {
    session.user = null;
    await prisma.company.updateMany({ data: { public: true } });
    await prisma.product.updateMany({ data: { public: true } });
    await prisma.service.updateMany({ data: { public: true } });
    await upsertChangelogFromCi(await serviceId(), "1.0.0", "note");
    await setChangelogVisibility("PUBLIC");

    const res = await loadChangelogAction({ company: "acme", product: "checkout", service: "api" });

    expect(res.ok).toBe(true);
  });
});
