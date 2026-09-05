"use client";

import { useCallback, useContext, useSyncExternalStore } from "react";
import { TIME_COOKIE, timeModeFromCookieValue } from "./timeMode";
import { TimeModeContext } from "@/components/TimeModeProvider";
import {
  stampDay, stampTime, stampShort, stampFull, dayKey, monthKey,
  toDatetimeInput, fromDatetimeInput, type TimeMode,
} from "./dateDisplay";

/**
 * The user's timestamp display mode: their own timezone (default) or UTC.
 *
 * Kept in a cookie so the server can read it and render the right mode from the
 * first frame. It used to live in localStorage, which the server cannot see: the
 * snapshot was always "utc" and every page flipped to local right after mount.
 * The layout now seeds the mode it rendered with, so the two sides agree and
 * there is nothing to flip.
 */
const EVENT = "rc-time-mode";

function read(): TimeMode {
  if (typeof document === "undefined") return "local";
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${TIME_COOKIE}=`));
  return timeModeFromCookieValue(match ? decodeURIComponent(match.slice(TIME_COOKIE.length + 1)) : null);
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** One year, matching the theme and locale cookies. */
const MAX_AGE = 60 * 60 * 24 * 365;

export function setTimeMode(mode: TimeMode): void {
  document.cookie = `${TIME_COOKIE}=${mode}; path=/; max-age=${MAX_AGE}; samesite=lax`;
  window.dispatchEvent(new Event(EVENT));
}

export function useTimeFormat() {
  // What the server rendered with. Used as the server snapshot so hydration
  // starts from the same mode the HTML was built in.
  const rendered = useContext(TimeModeContext);
  const mode = useSyncExternalStore(subscribe, read, () => rendered);
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
