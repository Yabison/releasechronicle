/**
 * Public-mode visibility for the REST API.
 *
 * The UI already hides private hierarchies from anonymous visitors, but the pages
 * read the same data the API serves — so without this the whole public/private
 * feature came down to knowing a URL. A signed-in caller sees everything; everyone
 * else sees only what public mode exposes:
 *
 *   - company, product and service all flagged public,
 *   - the event type is in PublicSetting.eventTypes,
 *   - the environment is flagged public.
 *
 * Private things return 404 rather than 403: telling an anonymous caller that
 * `secret/internal/core` exists is itself the leak.
 */
import type { Prisma, EventType } from "@prisma/client";
import { readSessionFromCookieHeader } from "@/lib/auth/session";
import { getPublicEventTypes } from "@/lib/visibility";
import { getPublicEnvSlugs } from "@/lib/environment";
import { prisma } from "@/lib/db";

export type Scope =
  | { anonymous: false }
  | { anonymous: true; types: string[]; envs: string[] };

export async function requestScope(req: Request): Promise<Scope> {
  const session = await readSessionFromCookieHeader(req.headers.get("cookie"));
  if (session) return { anonymous: false };
  const [types, envs] = await Promise.all([getPublicEventTypes(), getPublicEnvSlugs()]);
  return { anonymous: true, types, envs };
}

/** Spread into a Prisma `where` on Company/Product/Service to keep private rows out. */
export function publicOnly(scope: Scope): { public: true } | Record<string, never> {
  return scope.anonymous ? { public: true } : {};
}

/** Spread into a Prisma `where` on Event to keep private types/environments out. */
export function publicEventWhere(scope: Scope): Prisma.EventWhereInput {
  if (!scope.anonymous) return {};
  return {
    type: { in: scope.types as EventType[] },
    environment: { in: scope.envs },
  };
}

/**
 * Restrict an Event `where` to fully public hierarchies as well. Kept separate from
 * publicEventWhere because callers that already resolved a service only need the
 * type/environment half.
 */
export function publicEventScopeWhere(scope: Scope): Prisma.EventWhereInput {
  if (!scope.anonymous) return {};
  return {
    ...publicEventWhere(scope),
    // deletedAt only needs checking at the service level: the invariant a live
    // service always has a live product and company makes the deeper levels
    // redundant here.
    service: { public: true, deletedAt: null, product: { public: true, company: { public: true } } },
  };
}

/** True when an anonymous caller is allowed to see this service at all. */
export async function serviceVisible(scope: Scope, serviceId: string): Promise<boolean> {
  if (!scope.anonymous) return true;
  const hit = await prisma.service.findFirst({
    where: {
      id: serviceId, public: true, deletedAt: null,
      product: { public: true, deletedAt: null, company: { public: true, deletedAt: null } },
    },
    select: { id: true },
  });
  return !!hit;
}

/** 404 when the caller may not see the service, else null. */
export async function denyPrivateService(scope: Scope, serviceId: string): Promise<Response | null> {
  if (await serviceVisible(scope, serviceId)) return null;
  return Response.json({ error: "service not found" }, { status: 404 });
}
