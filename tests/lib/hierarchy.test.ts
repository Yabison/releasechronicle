import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import {
  createCompany,
  listCompanies,
  getCompanyBySlug,
  createProduct,
  getProductBySlug,
  createService,
  getServiceBySlug,
  moveService,
  moveProduct,
  InvalidParentError,
} from "@/lib/hierarchy";
import { deleteCompany, deleteProduct } from "@/lib/hierarchyDelete";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("companies", () => {
  it("creates with a derived slug", async () => {
    const c = await createCompany({ name: "Acme Inc" });
    expect(c.slug).toBe("acme-inc");
  });
  it("disambiguates duplicate slugs", async () => {
    await createCompany({ name: "Acme" });
    const second = await createCompany({ name: "Acme" });
    expect(second.slug).toBe("acme-2");
  });
  it("lists only non-deleted companies", async () => {
    const c = await createCompany({ name: "Acme" });
    await createCompany({ name: "Globex" });
    await deleteCompany(c.id);
    const all = await listCompanies();
    expect(all.map((x) => x.name)).toEqual(["Globex"]);
  });
  it("looks up by slug", async () => {
    await createCompany({ name: "Acme" });
    const found = await getCompanyBySlug("acme");
    expect(found?.name).toBe("Acme");
  });
  it("frees a company slug once soft-deleted, so the plain name is reusable", async () => {
    const first = await createCompany({ name: "Acme" });
    expect(first.slug).toBe("acme");
    await prisma.company.update({ where: { id: first.id }, data: { deletedAt: new Date() } });
    const second = await createCompany({ name: "Acme" });
    expect(second.slug).toBe("acme"); // not "acme-2"
    expect(second.id).not.toBe(first.id);
  });
  it("still disambiguates against a LIVE company of the same name", async () => {
    await createCompany({ name: "Acme" });
    const second = await createCompany({ name: "Acme" });
    expect(second.slug).toBe("acme-2");
  });
});

describe("products and services", () => {
  it("creates a product scoped to its company", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    expect(p.slug).toBe("checkout");
    const found = await getProductBySlug("acme", "checkout");
    expect(found?.id).toBe(p.id);
  });
  it("allows same product slug under different companies", async () => {
    const a = await createCompany({ name: "Acme" });
    const b = await createCompany({ name: "Globex" });
    const p1 = await createProduct({ companyId: a.id, name: "Checkout" });
    const p2 = await createProduct({ companyId: b.id, name: "Checkout" });
    expect(p1.slug).toBe("checkout");
    expect(p2.slug).toBe("checkout");
  });
  it("creates a typed service under a product", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    const s = await createService({ productId: p.id, name: "Payment API", type: "API" });
    expect(s.slug).toBe("payment-api");
    expect(s.type).toBe("API");
    const found = await getServiceBySlug("acme", "checkout", "payment-api");
    expect(found?.id).toBe(s.id);
  });
  it("frees a product slug per company once soft-deleted", async () => {
    const c = await createCompany({ name: "Acme" });
    const first = await createProduct({ companyId: c.id, name: "Checkout" });
    await prisma.product.update({ where: { id: first.id }, data: { deletedAt: new Date() } });
    const second = await createProduct({ companyId: c.id, name: "Checkout" });
    expect(second.slug).toBe("checkout");
  });
  it("frees a service slug per product once soft-deleted", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    const first = await createService({ productId: p.id, name: "API", type: "API" });
    await prisma.service.update({ where: { id: first.id }, data: { deletedAt: new Date() } });
    const second = await createService({ productId: p.id, name: "API", type: "API" });
    expect(second.slug).toBe("api");
  });
  it("moves a service into a product whose same-slug sibling is soft-deleted", async () => {
    const c = await createCompany({ name: "Acme" });
    const from = await createProduct({ companyId: c.id, name: "From" });
    const to = await createProduct({ companyId: c.id, name: "To" });
    const moving = await createService({ productId: from.id, name: "API", type: "API" });
    const blocker = await createService({ productId: to.id, name: "API", type: "API" });
    await prisma.service.update({ where: { id: blocker.id }, data: { deletedAt: new Date() } });
    const moved = await moveService(moving.id, to.id); // used to throw a raw P2002
    expect(moved?.productId).toBe(to.id);
  });
});

describe("the live-parent invariant on writes into/under a deleted row", () => {
  it("refuses to move a service into a soft-deleted product", async () => {
    const c = await createCompany({ name: "Acme" });
    const from = await createProduct({ companyId: c.id, name: "From" });
    const to = await createProduct({ companyId: c.id, name: "To" });
    const svc = await createService({ productId: from.id, name: "API", type: "API" });
    await deleteProduct(to.id);
    await expect(moveService(svc.id, to.id)).rejects.toThrow(InvalidParentError);
    // control: the service never actually moved
    const unchanged = await getServiceBySlug("acme", "from", "api");
    expect(unchanged?.productId).toBe(from.id);
  });

  it("refuses to move a product into a soft-deleted company", async () => {
    const a = await createCompany({ name: "Acme" });
    const b = await createCompany({ name: "Bravo" });
    const prod = await createProduct({ companyId: a.id, name: "Checkout" });
    await deleteCompany(b.id);
    await expect(moveProduct(prod.id, b.id)).rejects.toThrow(InvalidParentError);
    const unchanged = await getProductBySlug("acme", "checkout");
    expect(unchanged?.companyId).toBe(a.id);
  });

  it("refuses to create a product under a soft-deleted company", async () => {
    const c = await createCompany({ name: "Acme" });
    await deleteCompany(c.id);
    await expect(createProduct({ companyId: c.id, name: "Checkout" })).rejects.toThrow(InvalidParentError);
  });

  it("refuses to create a service under a soft-deleted product", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    await deleteProduct(p.id);
    await expect(createService({ productId: p.id, name: "API", type: "API" })).rejects.toThrow(InvalidParentError);
  });

  it("control: moving and creating under a LIVE parent still works", async () => {
    const a = await createCompany({ name: "Acme" });
    const b = await createCompany({ name: "Bravo" });
    const p1 = await createProduct({ companyId: a.id, name: "Checkout" });
    const p2 = await createProduct({ companyId: a.id, name: "Billing" });
    const moved = await moveProduct(p1.id, b.id);
    expect(moved?.companyId).toBe(b.id);

    const svc = await createService({ productId: p2.id, name: "API", type: "API" });
    const movedSvc = await moveService(svc.id, moved!.id);
    expect(movedSvc?.productId).toBe(moved!.id);

    const newProduct = await createProduct({ companyId: b.id, name: "Support" });
    expect(newProduct.companyId).toBe(b.id);
    const newService = await createService({ productId: newProduct.id, name: "Web", type: "APP" });
    expect(newService.productId).toBe(newProduct.id);
  });
});
