import { randomBytes } from "node:crypto";
import type { IngestScope } from "@prisma/client";
import { prisma } from "@/lib/db";

type NewSource = {
  scope: IngestScope;
  serviceId?: string;
  companyId?: string;
  label: string;
  defaultEnvironment: string | null;
};

export function createIngestSource(input: NewSource) {
  return prisma.ingestSource.create({
    data: {
      scope: input.scope,
      serviceId: input.serviceId ?? null,
      companyId: input.companyId ?? null,
      label: input.label,
      defaultEnvironment: input.defaultEnvironment,
      token: randomBytes(24).toString("base64url"),
    },
  });
}

export function findIngestSourceByToken(token: string) {
  return prisma.ingestSource.findFirst({
    where: { token, enabled: true },
    include: { company: true },
  });
}

export function listIngestSources(serviceId: string) {
  return prisma.ingestSource.findMany({ where: { scope: "SERVICE", serviceId }, orderBy: { createdAt: "desc" } });
}

export function listCompanyIngestSources(companyId: string) {
  return prisma.ingestSource.findMany({ where: { scope: "COMPANY", companyId }, orderBy: { createdAt: "desc" } });
}

export function listGlobalIngestSources() {
  return prisma.ingestSource.findMany({ where: { scope: "GLOBAL" }, orderBy: { createdAt: "desc" } });
}

export function deleteIngestSource(id: string) {
  return prisma.ingestSource.delete({ where: { id } });
}
