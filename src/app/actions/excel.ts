"use server";

import { revalidatePath } from "next/cache";
import type { EventType } from "@prisma/client";
import { deploymentBodySchema, incidentBodySchema, maintenanceBodySchema } from "@/lib/schemas/event";
import { zodErrorMessage } from "@/lib/schemas/parse";
import { createEvent, upsertEventByExternalId, type EventData } from "@/lib/events";
import { readWorkbook, buildWorkbook, rowToBody, eventToRow, type ExcelRow } from "@/lib/excel";
import { getServiceBySlug } from "@/lib/hierarchy";
import { getActiveEnvSlugs } from "@/lib/environment";
import { queryEventsForExport, type ExportFilter } from "@/lib/eventExport";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

/** A failed row: an i18n key (`err.*`) plus its interpolation variables — or a raw
 *  validator message, which renders as-is. */
export type ImportError = { row: number; error: string; vars?: Record<string, string | number> };
export type ImportResult = { ok: true; count: number } | { ok: false; errors: ImportError[] };

function validateRow(body: Record<string, unknown>) {
  const schema =
    body.type === "DEPLOYMENT" ? deploymentBodySchema :
    body.type === "INCIDENT" ? incidentBodySchema :
    body.type === "MAINTENANCE" ? maintenanceBodySchema : null;
  if (!schema) return { ok: false as const, error: "err.unknownRowType", vars: { type: String(body.type) } };
  const v = schema.safeParse(body);
  if (!v.success) return { ok: false as const, error: zodErrorMessage(v.error) };
  return { ok: true as const, value: v.data };
}

/** Import events from an uploaded .xlsx. All-or-nothing: any bad row aborts the whole file. */
export async function importEventsXlsx(formData: FormData): Promise<ImportResult> {
  if (!(await getSession())) return { ok: false, errors: [{ row: 0, error: "err.loginRequired" }] };
  const file = formData.get("file");
  if (!(file instanceof Blob)) return { ok: false, errors: [{ row: 0, error: "err.noFile" }] };
  const bytes = new Uint8Array(await file.arrayBuffer());

  let rows: ExcelRow[];
  try {
    rows = await readWorkbook(bytes);
  } catch {
    return { ok: false, errors: [{ row: 0, error: "err.unreadableXlsx" }] };
  }
  if (rows.length === 0) return { ok: false, errors: [{ row: 0, error: "err.emptyWorkbook" }] };

  const errors: ImportError[] = [];
  const prepared: { externalId: string | null; data: EventData }[] = [];
  const activeEnvSlugs = new Set(await getActiveEnvSlugs());

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // header is row 1
    const body = rowToBody(rows[i]);
    const bodyType = body.type as EventType;
    const v = validateRow(body);
    if (!v.ok) { errors.push({ row: rowNum, error: v.error, ...("vars" in v ? { vars: v.vars } : {}) }); continue; }
    const val = v.value;
    if (!activeEnvSlugs.has(val.environment)) {
      errors.push({ row: rowNum, error: "err.unknownEnvNamed", vars: { env: val.environment } });
      continue;
    }
    const service = await getServiceBySlug(val.service.company, val.service.product, val.service.service);
    if (!service) { errors.push({ row: rowNum, error: "err.serviceNotFound" }); continue; }
    prepared.push({
      externalId: val.externalId ?? null,
      data: {
        serviceId: service.id,
        environment: val.environment,
        type: bodyType,
        occurredAt: val.occurredAt,
        externalId: val.externalId,
        metadata: val.metadata,
        tags: val.tags,
        fields: val.fields as Record<string, unknown>,
      },
    });
  }

  if (errors.length) return { ok: false, errors };

  await prisma.$transaction(async (tx) => {
    for (const p of prepared) {
      if (p.externalId) await upsertEventByExternalId(p.externalId, p.data, tx);
      else await createEvent(p.data, tx);
    }
  });

  revalidatePath("/");
  return { ok: true, count: prepared.length };
}

/** Export the events matching the current filter as .xlsx bytes. */
export async function exportEventsXlsx(filter: ExportFilter): Promise<Uint8Array> {
  // Returns bytes, so it has no failure shape to carry a message: throw instead.
  if (!(await getSession())) throw new Error("err.loginRequired");
  const events = await queryEventsForExport(filter);
  return buildWorkbook(events.map(eventToRow));
}
