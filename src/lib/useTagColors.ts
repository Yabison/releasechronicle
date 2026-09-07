"use client";

import { useEffect, useState } from "react";

/**
 * Tag name/slug → colour, for the chips on a timeline row.
 *
 * Client-side because the colours are configuration, not part of the event: a
 * server round-trip per page would refetch the same handful of rows every time.
 * GET /api/v1/tags is public for exactly this reason.
 *
 * A failure is cosmetic on purpose — uncoloured chips, not a broken list — so
 * the rejection is swallowed rather than surfaced.
 */
export function useTagColors(): Record<string, string> {
  const [colors, setColors] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    fetch("/api/v1/tags")
      .then((r) => r.json())
      .then((rows: { name: string; slug: string; color: string | null }[]) => {
        if (!live) return;
        const map: Record<string, string> = {};
        for (const t of rows) if (t.color) { map[t.name] = t.color; map[t.slug] = t.color; }
        setColors(map);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return colors;
}
