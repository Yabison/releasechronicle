import { Prisma } from "@prisma/client";

/** True if the error is a Prisma unique-constraint violation (duplicate slug, etc.). */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** True if the error is a Prisma foreign-key violation (e.g. a parent id that does not exist). */
export function isForeignKeyViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";
}
