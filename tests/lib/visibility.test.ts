import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { canWrite, isAnonymous, isServicePublic, getPublicEventTypes, setPublicEventTypes } from "@/lib/visibility";
import type { SessionUser } from "@/lib/auth/session";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

const user = (roles: string[]): SessionUser => ({ sub: "u", name: "U", roles: roles as SessionUser["roles"] });

describe("canWrite / isAnonymous", () => {
  it("admin and devops can write; viewer and anonymous cannot", () => {
    expect(canWrite(user(["admin"]))).toBe(true);
    expect(canWrite(user(["devops"]))).toBe(true);
    expect(canWrite(user(["viewer"]))).toBe(false);
    expect(canWrite(null)).toBe(false);
    expect(isAnonymous(null)).toBe(true);
    expect(isAnonymous(user(["viewer"]))).toBe(false);
  });
});

describe("isServicePublic", () => {
  it("requires the whole chain (company + product + service) to be public", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Pay" });
    const s = await createService({ productId: p.id, name: "Api", type: "API" });
    expect(await isServicePublic(c.slug, p.slug, s.slug)).toBe(false);
    await prisma.service.update({ where: { id: s.id }, data: { public: true } });
    await prisma.product.update({ where: { id: p.id }, data: { public: true } });
    expect(await isServicePublic(c.slug, p.slug, s.slug)).toBe(false);
    await prisma.company.update({ where: { id: c.id }, data: { public: true } });
    expect(await isServicePublic(c.slug, p.slug, s.slug)).toBe(true);
  });
});

describe("public event types", () => {
  it("defaults to deployments + maintenances", async () => {
    expect(await getPublicEventTypes()).toEqual(["DEPLOYMENT", "MAINTENANCE"]);
  });
  it("persists a filtered set (drops unknown types)", async () => {
    await setPublicEventTypes(["DEPLOYMENT", "INCIDENT", "BOGUS"]);
    expect(await getPublicEventTypes()).toEqual(["DEPLOYMENT", "INCIDENT"]);
  });
});
