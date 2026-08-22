"use client";

import { createContext, type ReactNode } from "react";
import type { TimeMode } from "@/lib/dateDisplay";
import { DEFAULT_TIME_MODE } from "@/lib/timeMode";

/**
 * Carries the mode the SERVER rendered with down to the client, the same way
 * I18nProvider carries the locale.
 *
 * Without it the client's first render would have to guess, and useTimeFormat
 * guessed "utc" — so every timestamp on the page changed once, right after
 * mount, for anyone reading in local time.
 */
export const TimeModeContext = createContext<TimeMode>(DEFAULT_TIME_MODE);

export function TimeModeProvider({ mode, children }: { mode: TimeMode; children: ReactNode }) {
  return <TimeModeContext.Provider value={mode}>{children}</TimeModeContext.Provider>;
}
