/**
 * POSTMEP_SQL is retired: no new event may carry it, but an event that already
 * does stays readable and keeps working.
 *
 * The value stays in the Postgres enum deliberately — removing it would fail on
 * any instance holding one — so "retired" is enforced in code, on three input
 * paths: the REST body, the CI ingest body, and reclassification.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ChangeType } from "@prisma/client";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent, setEventChangeType, RetiredChangeTypeError } from "@/lib/events";
import { deploymentBodySchema } from "@/lib/schemas/event";
import { ciDeploymentBodySchema } from "@/lib/schemas/ciDeployment";
import { CREATABLE_CHANGE_TYPES, RETIRED_CHANGE_TYPES } from "@/lib/schemas/common";

const RETIRED = ChangeType.POSTMEP_SQL;

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

async function deployment(changeType: ChangeType) {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  // Straight through the domain, bypassing the input schemas: this is how a row
  // created before the retirement looks.
  return createEvent({
    serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: "1.0.0", requester: "ci", changeType, deployStatus: "DEPLOYED", lot: "1.0.0" },
  });
}

describe("the retired set is coherent", () => {
  it("names POSTMEP_SQL and nothing that is also creatable", () => {
    expect(RETIRED_CHANGE_TYPES).toContain(RETIRED);
    expect(CREATABLE_CHANGE_TYPES).not.toContain(RETIRED);
    expect(CREATABLE_CHANGE_TYPES).toContain(ChangeType.NORMAL);
    expect(CREATABLE_CHANGE_TYPES).toContain(ChangeType.PRE_MEP);
  });
});

describe("creation refuses a retired change type", () => {
  const body = (changeType: string) => ({
    company: "acme", product: "checkout", service: "api", environment: "PROD",
    version: "1.0.0", requester: "ci", changeType,
  });

  it("the REST deployment body 400s on it", () => {
    const bad = deploymentBodySchema.safeParse(body(RETIRED));
    expect(bad.success).toBe(false);
    // and still accepts a creatable one, so the test is not passing for the wrong reason
    expect(deploymentBodySchema.safeParse(body(ChangeType.NORMAL)).success).toBe(true);
  });

  it("the CI ingest body 400s on it", () => {
    expect(ciDeploymentBodySchema.safeParse({ version: "1.0.0", changeType: RETIRED }).success).toBe(false);
    expect(ciDeploymentBodySchema.safeParse({ version: "1.0.0", changeType: ChangeType.HOTFIX }).success).toBe(true);
  });

  it("names the offending field, so a CI log says what to fix", () => {
    const bad = deploymentBodySchema.safeParse(body(RETIRED));
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues.some((i) => i.path.includes("changeType"))).toBe(true);
  });
});

describe("reclassification keeps a retired type but never grants it", () => {
  /** The drawer offers POSTMEP_SQL only for an event that already has it, and
   *  submitting that form unchanged must keep working. */
  it("allows keeping it on an event that already carries it", async () => {
    const ev = await deployment(RETIRED);
    const updated = await setEventChangeType(ev.id, RETIRED);
    expect(updated?.changeType).toBe(RETIRED);
  });

  it("refuses putting it on an event that does not", async () => {
    const ev = await deployment(ChangeType.NORMAL);
    await expect(setEventChangeType(ev.id, RETIRED)).rejects.toThrow(RetiredChangeTypeError);
    const row = await prisma.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(row.changeType).toBe(ChangeType.NORMAL);
  });

  it("still lets a retired event move to a live type", async () => {
    const ev = await deployment(RETIRED);
    const updated = await setEventChangeType(ev.id, ChangeType.NORMAL);
    expect(updated?.changeType).toBe(ChangeType.NORMAL);
  });
});

describe("existing data stays usable", () => {
  it("reads back an event created with the retired type", async () => {
    const ev = await deployment(RETIRED);
    const row = await prisma.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(row.changeType).toBe(RETIRED);
  });
});
