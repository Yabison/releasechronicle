import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { CalendarFilter } from "@/lib/calendarQuery";

export type CalendarFeedRow = {
  id: string; name: string; token: string;
  company: string | null; product: string | null; service: string | null;
  environment: string | null; types: string[];
};

export function listCalendarFeeds(): Promise<CalendarFeedRow[]> {
  return prisma.calendarFeed.findMany({ orderBy: { createdAt: "asc" } });
}

export function getCalendarFeedByToken(token: string) {
  return prisma.calendarFeed.findUnique({ where: { token } });
}

export function createCalendarFeed(input: {
  name: string; company?: string | null; product?: string | null;
  service?: string | null; environment?: string | null; types?: string[];
}): Promise<CalendarFeedRow> {
  return prisma.calendarFeed.create({
    data: {
      name: input.name,
      token: randomBytes(16).toString("hex"),
      company: input.company || null,
      product: input.product || null,
      service: input.service || null,
      environment: input.environment || null,
      types: input.types ?? [],
    },
  });
}

export async function deleteCalendarFeed(id: string): Promise<void> {
  await prisma.calendarFeed.delete({ where: { id } });
}

/** The CalendarFilter a feed represents. */
export function feedFilter(feed: CalendarFeedRow): CalendarFilter {
  return {
    company: feed.company ?? undefined,
    product: feed.product ?? undefined,
    service: feed.service ?? undefined,
    environment: feed.environment ?? undefined,
    types: feed.types.length ? feed.types : undefined,
  };
}
