import { prisma } from "@/lib/db";

export function listDirectoryUsers() {
  return prisma.directoryUser.findMany({ orderBy: { username: "asc" } });
}
