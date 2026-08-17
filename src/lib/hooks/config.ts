import { Prisma, type DeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export function listHooks(productId: string) {
  return prisma.hook.findMany({ where: { productId }, orderBy: { createdAt: "desc" } });
}
export function createHook(data: { productId: string; type: string; events: string[]; transitions?: string[]; config: Record<string, unknown>; targetId?: string | null; enabled?: boolean }) {
  return prisma.hook.create({
    data: {
      productId: data.productId,
      type: data.type,
      events: data.events,
      transitions: data.transitions ?? [],
      config: data.config as Prisma.InputJsonValue,
      targetId: data.targetId ?? null,
      enabled: data.enabled ?? true,
    },
  });
}
export function deleteHook(id: string) {
  return prisma.hook.delete({ where: { id } });
}
export type DeliveryRow = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  nextAttemptAt: Date | null;
  statusCode: number | null;
  error: string | null;
  createdAt: Date;
  payload: unknown;
  hookType: string;
};

export type DeliveryFilter = {
  kind?: string;
  type?: string;
  status?: DeliveryStatus;
  statusCode?: number;
  error?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export async function listDeliveries(
  productId: string,
  filter: DeliveryFilter = {},
): Promise<{ rows: DeliveryRow[]; total: number }> {
  const where: Prisma.HookDeliveryWhereInput = {
    hook: { productId, ...(filter.type ? { type: filter.type } : {}) },
  };
  if (filter.kind) where.kind = filter.kind;
  if (filter.status) where.status = filter.status;
  if (filter.statusCode !== undefined) where.statusCode = filter.statusCode;
  if (filter.error) where.error = { contains: filter.error, mode: "insensitive" };
  if (filter.from || filter.to) {
    where.createdAt = {};
    if (filter.from) (where.createdAt as Prisma.DateTimeFilter).gte = filter.from;
    if (filter.to) (where.createdAt as Prisma.DateTimeFilter).lte = filter.to;
  }

  const take = filter.limit ?? 50;
  const skip = filter.offset ?? 0;
  const [records, total] = await prisma.$transaction([
    prisma.hookDelivery.findMany({
      where,
      include: { hook: { select: { type: true } } },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.hookDelivery.count({ where }),
  ]);
  const rows: DeliveryRow[] = records.map((r) => ({
    id: r.id, kind: r.kind, status: r.status, attempts: r.attempts, nextAttemptAt: r.nextAttemptAt,
    statusCode: r.statusCode, error: r.error,
    createdAt: r.createdAt, payload: r.payload, hookType: r.hook.type,
  }));
  return { rows, total };
}
