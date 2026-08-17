import { z } from "zod";
import { ChangeType, DeployStatus } from "@prisma/client";
import { nonEmpty, optionalStr, optionalOrNull, commentStr, isoDate, changeTypeSchema, deployStatusSchema, ignoredIfInvalid } from "./common";

/**
 * The CI ingest variant of a deployment body. Every way it diverges from the
 * REST schema is a visible default in THIS file:
 *   requester → "ci", changeType → NORMAL, deployStatus → DEPLOYED, lot → version.
 * Service resolution (token scope) and the environment fallback/active check
 * stay in ingestDeployment.ts — they need the DB.
 */
export const ciDeploymentBodySchema = z
  .object({
    version: nonEmpty(),
    company: optionalStr(),
    product: optionalStr(),
    service: optionalStr(),
    environment: optionalStr(),
    requester: optionalStr(),
    changeType: changeTypeSchema.default(ChangeType.NORMAL),
    deployStatus: deployStatusSchema.default(DeployStatus.DEPLOYED),
    lot: optionalStr(),
    comment: ignoredIfInvalid(commentStr),
    externalLink: optionalOrNull(),
    scheduledAt: isoDate.nullish(),
  })
  .superRefine((b, ctx) => {
    if (b.deployStatus === DeployStatus.SCHEDULED && b.scheduledAt == null) {
      ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt is required when deployStatus is SCHEDULED" });
    }
  })
  .transform((b) => ({
    version: b.version,
    company: b.company,
    product: b.product,
    service: b.service,
    environment: b.environment,
    fields: {
      version: b.version,
      requester: b.requester ?? "ci",
      changeType: b.changeType,
      deployStatus: b.deployStatus,
      externalLink: b.externalLink,
      lot: b.lot ?? b.version,
      comment: b.comment ?? null,
      scheduledAt: b.scheduledAt ?? null,
    },
  }));

export type CiDeploymentBody = z.output<typeof ciDeploymentBodySchema>;
