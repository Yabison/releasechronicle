import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// Anonymous caller for every test in this file: server actions are plain POST
// endpoints, so each one must refuse on its own.
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => null,
  hasRole: () => false,
}));

import {
  createEventAction,
  updateIncidentAction,
  updateEventLotAction,
  updateEventChangeTypeAction,
  updateEventDateAction,
  updateEventHourTypeAction,
  updateEventTagsAction,
  updateEventCommentAction,
  addEventCommentAction,
  createLotFromExistingAction,
  createLotAction,
  updateEventCausedByAction,
} from "@/app/actions/events";
import { importEventsXlsx, exportEventsXlsx } from "@/app/actions/excel";

async function seedDeploy() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  return createEvent({
    serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(),
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED" },
  });
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("server actions refuse an anonymous caller", () => {
  it("createEventAction", async () => {
    await seedDeploy();
    const res = await createEventAction({
      type: "DEPLOYMENT", company: "acme", product: "checkout", service: "api", path: "/",
      environment: "PROD", version: "2.0.0", requester: "x", changeType: "NORMAL",
    });
    expect(res).toEqual({ ok: false, error: "err.loginRequired" });
    expect(await prisma.event.count()).toBe(1);
  });

  it("updateIncidentAction", async () => {
    const ev = await seedDeploy();
    expect(await updateIncidentAction({ eventId: ev.id, path: "/", status: "RESOLVED" }))
      .toEqual({ ok: false, error: "err.loginRequired" });
  });

  it("updateEventLotAction", async () => {
    const ev = await seedDeploy();
    expect(await updateEventLotAction({ eventId: ev.id, lot: "L1", path: "/" }))
      .toEqual({ ok: false, error: "err.loginRequired" });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.lot).toBeNull();
  });

  it("updateEventChangeTypeAction", async () => {
    const ev = await seedDeploy();
    expect(await updateEventChangeTypeAction({ eventId: ev.id, changeType: "HOTFIX", path: "/" }))
      .toEqual({ ok: false, error: "err.loginRequired" });
  });

  it("updateEventDateAction", async () => {
    const ev = await seedDeploy();
    expect(await updateEventDateAction({ eventId: ev.id, occurredAt: "2026-01-01T00:00:00Z", path: "/" }))
      .toEqual({ ok: false, error: "err.loginRequired" });
  });

  it("updateEventHourTypeAction", async () => {
    const ev = await seedDeploy();
    expect(await updateEventHourTypeAction({ eventId: ev.id, hourType: "HNO", path: "/" }))
      .toEqual({ ok: false, error: "err.loginRequired" });
  });

  it("updateEventTagsAction", async () => {
    const ev = await seedDeploy();
    expect(await updateEventTagsAction({ eventId: ev.id, tags: ["x"], path: "/" }))
      .toEqual({ ok: false, error: "err.loginRequired" });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.tags).toEqual([]);
  });

  it("updateEventCommentAction", async () => {
    const ev = await seedDeploy();
    expect(await updateEventCommentAction({ eventId: ev.id, comment: "hi", path: "/" }))
      .toEqual({ ok: false, error: "err.loginRequired" });
  });

  it("addEventCommentAction", async () => {
    const ev = await seedDeploy();
    expect(await addEventCommentAction({ eventId: ev.id, body: "hi", path: "/" }))
      .toEqual({ ok: false, error: "err.loginRequired" });
    expect(await prisma.eventComment.count()).toBe(0);
  });

  it("updateEventCausedByAction", async () => {
    const ev = await seedDeploy();
    expect(await updateEventCausedByAction({ eventId: ev.id, causeId: null, path: "/" }))
      .toEqual({ ok: false, error: "err.loginRequired" });
  });

  it("createLotFromExistingAction", async () => {
    const ev = await seedDeploy();
    expect(await createLotFromExistingAction({ eventIds: [ev.id], lot: "L1", path: "/" }))
      .toEqual({ ok: false, error: "err.loginRequired" });
  });

  it("createLotAction", async () => {
    await seedDeploy();
    const res = await createLotAction({
      path: "/",
      common: { environment: "PROD", requester: "x", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "L1" },
      items: [{ company: "acme", product: "checkout", service: "api", version: "3.0.0" }],
    });
    expect(res).toEqual({ ok: false, error: "err.loginRequired" });
    expect(await prisma.event.count()).toBe(1);
  });

  it("importEventsXlsx", async () => {
    const fd = new FormData();
    fd.set("file", new Blob([new Uint8Array([1, 2, 3])]), "x.xlsx");
    const res = await importEventsXlsx(fd);
    expect(res.ok).toBe(false);
    expect(res).toEqual({ ok: false, errors: [{ row: 0, error: "err.loginRequired" }] });
  });

  it("exportEventsXlsx", async () => {
    await expect(exportEventsXlsx({})).rejects.toThrow(/login/i);
  });
});
