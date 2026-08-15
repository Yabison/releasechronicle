"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  stampDay, stampTime, stampShort, stampFull, dayKey, monthKey,
  toDatetimeInput, fromDatetimeInput, type TimeMode,
} from "./dateDisplay";

/**
 * The user's timestamp display mode: their own timezone (default) or UTC.
 *
 * Server-rendered HTML cannot know the visitor's timezone, so the server snapshot
 * is "utc" — deterministic on both sides of hydration — and the real preference
 * takes over right after mount. useSyncExternalStore makes that flip a normal
 * re-render instead of a hydration mismatch.
 */
const KEY = "rc_time_mode";
const EVENT = "rc-time-mode";

function read(): TimeMode {
  try {
    return window.localStorage.getItem(KEY) === "utc" ? "utc" : "local";
  } catch {
    return "local";
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function setTimeMode(mode: TimeMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Storage may be unavailable (private mode); the event still updates this tab.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useTimeFormat() {
  const mode = useSyncExternalStore(subscribe, read, () => "utc" as TimeMode);
  const opts = { mode };
  return {
    mode,
    setMode: setTimeMode,
    stampDay: useCallback((iso: string | Date) => stampDay(iso, { mode }), [mode]),
    stampTime: useCallback((iso: string | Date) => stampTime(iso, { mode }), [mode]),
    stampShort: useCallback((iso: string | Date) => stampShort(iso, { mode }), [mode]),
    stampFull: useCallback((iso: string | Date) => stampFull(iso, { mode }), [mode]),
    dayKey: useCallback((iso: string | Date) => dayKey(iso, { mode }), [mode]),
    monthKey: useCallback((iso: string | Date) => monthKey(iso, { mode }), [mode]),
    toInput: useCallback((iso: string | Date) => toDatetimeInput(iso, { mode }), [mode]),
    fromInput: useCallback((value: string) => fromDatetimeInput(value, mode), [mode]),
    opts,
  };
}
