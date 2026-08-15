"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Near-real-time refresh without SSE: re-fetch the server components on an
 * interval and whenever the window regains focus, so a user sees others'
 * changes shortly after they happen. Skips ticks while the tab is hidden.
 */
export function useAutoRefresh(intervalMs = 15000): void {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    window.addEventListener("focus", router.refresh);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", router.refresh);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
}
