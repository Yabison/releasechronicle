import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { buildWorkbook } from "@/lib/excel";
import { getMessages } from "@/i18n";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Tester", roles: ["admin", "devops", "qa"] }) }));
import { importEventsXlsx, exportEventsXlsx } from "@/app/actions/excel";
import { readWorkbook } from "@/lib/excel";
import { deleteService } from "@/lib/hierarchyDelete";

async function seed() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  await createService({ productId: p.id, name: "Payment API", type: "API" });
  // Membership is enforced against the active env table now; seed the uppercase
  // slug this suite's fixtures use (dep() defaults environment to "PROD").
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
}
function fileFrom(bytes: Uint8Array): FormData {
  const fd = new FormData();
  fd.set("file", new Blob([bytes]), "events.xlsx");
  return fd;
}
const dep = (over: Record<string, unknown> = {}) => ({
  type: "DEPLOYMENT", company: "acme", product: "checkout", service: "payment-api",
  environment: "PROD", version: "1.0.0", requester: "ci", changeType: "NORMAL", ...over,
});

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("importEventsXlsx", () => {
  it("imports all valid rows", async () => {
    await seed();
    const buf = await buildWorkbook([dep({ externalId: "dep-1" }), dep({ externalId: "dep-2" })]);
    const res = await importEventsXlsx(fileFrom(buf));
    expect(res).toEqual({ ok: true, count: 2 });
    expect(await prisma.event.count()).toBe(2);
  });

  it("rejects the whole file and persists nothing when a row is invalid", async () => {
    await seed();
    const buf = await buildWorkbook([
      dep({ externalId: "dep-1" }),
      dep({ externalId: "dep-2", environment: "NOPE" }),
    ]);
    const res = await importEventsXlsx(fileFrom(buf));
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.errors.length).toBeGreaterThanOrEqual(1);
    expect(res.errors[0].row).toBe(3); // header=1, dep-1=2, bad=3
    expect(await prisma.event.count()).toBe(0);
  });

  it("rejects and persists nothing when a service is unknown", async () => {
    await seed();
    const buf = await buildWorkbook([dep({ externalId: "dep-1", service: "ghost" })]);
    const res = await importEventsXlsx(fileFrom(buf));
    expect(res.ok).toBe(false);
    expect(await prisma.event.count()).toBe(0);
  });

  it("reports an unknown environment as an i18n key carrying the offending value", async () => {
    await seed();
    const buf = await buildWorkbook([dep({ externalId: "dep-1", environment: "NOPE" })]);
    const res = await importEventsXlsx(fileFrom(buf));
    if (res.ok) throw new Error("expected failure");
    expect(res.errors[0]).toMatchObject({ row: 2, error: "err.unknownEnvNamed", vars: { env: "NOPE" } });
    for (const loc of ["fr", "en"] as const) {
      expect(getMessages(loc)["err.unknownEnvNamed"]).toContain("{env}");
    }
  });

  it("reports a missing file as an i18n key", async () => {
    const res = await importEventsXlsx(new FormData());
    if (res.ok) throw new Error("expected failure");
    expect(res.errors[0]).toMatchObject({ row: 0, error: "err.noFile" });
    expect(getMessages("en")["err.noFile"]).toBeTruthy();
  });

  it("reports an unreadable workbook as an i18n key", async () => {
    const res = await importEventsXlsx(fileFrom(new Uint8Array([1, 2, 3])));
    if (res.ok) throw new Error("expected failure");
    expect(res.errors[0]).toMatchObject({ row: 0, error: "err.unreadableXlsx" });
    expect(getMessages("en")["err.unreadableXlsx"]).toBeTruthy();
  });

  it("reports an unknown service as an i18n key", async () => {
    await seed();
    const buf = await buildWorkbook([dep({ externalId: "dep-1", service: "ghost" })]);
    const res = await importEventsXlsx(fileFrom(buf));
    if (res.ok) throw new Error("expected failure");
    expect(res.errors[0]).toMatchObject({ row: 2, error: "err.serviceNotFound" });
  });

  it("is idempotent — re-importing an export leaves the count unchanged", async () => {
    await seed();
    const buf = await buildWorkbook([dep({ externalId: "dep-1" })]);
    await importEventsXlsx(fileFrom(buf));
    await importEventsXlsx(fileFrom(buf));
    expect(await prisma.event.count()).toBe(1);
  });
});

describe("exportEventsXlsx", () => {
  it("returns a workbook of the current events", async () => {
    await seed();
    const buf = await buildWorkbook([dep({ externalId: "dep-1" })]);
    await importEventsXlsx(fileFrom(buf));
    const bytes = await exportEventsXlsx({});
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("omits events of a soft-deleted service", async () => {
    await seed();
    const buf = await buildWorkbook([dep({ externalId: "dep-1" })]);
    await importEventsXlsx(fileFrom(buf));
    const svc = await prisma.service.findFirstOrThrow({ where: { slug: "payment-api" } });
    await deleteService(svc.id);
    const bytes = await exportEventsXlsx({});
    const rows = await readWorkbook(bytes);
    expect(rows).toHaveLength(0);
  });
});
