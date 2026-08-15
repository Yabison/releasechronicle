import { hasRole, type SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/** Roles allowed to mutate data (create/transition/edit events, admin config). */
export function canWrite(session: SessionUser | null): boolean {
  return hasRole(session, "admin") || hasRole(session, "devops");
}

/** No session at all → public/anonymous visitor, read-only + public-only data. */
export function isAnonymous(session: SessionUser | null): boolean {
  return !session;
}

/** A service is publicly visible only when it and its product and company are all public. */
export async function isServicePublic(companySlug: string, productSlug: string, serviceSlug: string): Promise<boolean> {
  const svc = await prisma.service.findFirst({
    where: {
      slug: serviceSlug, public: true, deletedAt: null,
      product: {
        slug: productSlug, public: true, deletedAt: null,
        company: { slug: companySlug, public: true, deletedAt: null },
      },
    },
    select: { id: true },
  });
  return !!svc;
}

const DEFAULT_PUBLIC_TYPES = ["DEPLOYMENT", "MAINTENANCE"];

/** Global set of event types an anonymous visitor may see. */
export async function getPublicEventTypes(): Promise<string[]> {
  const s = await prisma.publicSetting.findUnique({ where: { id: "singleton" } });
  return s?.eventTypes ?? DEFAULT_PUBLIC_TYPES;
}

export async function setPublicEventTypes(types: string[]): Promise<void> {
  const clean = types.filter((t) => ["DEPLOYMENT", "INCIDENT", "MAINTENANCE"].includes(t));
  await prisma.publicSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", eventTypes: clean },
    update: { eventTypes: clean },
  });
}
