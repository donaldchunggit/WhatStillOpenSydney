import type { DayKey, Hours, TimeRange } from "@/lib/types";

function dayKeyFromDate(d: Date): DayKey {
  const map: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()] ?? "mon";
}

function parseHHMM(hhmm: string) {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m };
}

function withTime(base: Date, hhmm: string): Date | null {
  const t = parseHHMM(hhmm);
  if (!t) return null;

  const d = new Date(base);
  d.setSeconds(0, 0);

  // Treat 24:00 as end-of-day (next day at 00:00)
  if (t.h === 24 && t.m === 0) {
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d;
  }

  d.setHours(t.h, t.m, 0, 0);
  return d;
}

function isWithinRange(at: Date, start: Date, end: Date) {
  return at.getTime() >= start.getTime() && at.getTime() < end.getTime();
}

/**
 * Returns the closing DateTime for the range that contains `at`, else null.
 */
export function getVenueCloseAt(hours: Hours, at: Date): Date | null {
  const day: DayKey = dayKeyFromDate(at);
  const ranges: TimeRange[] = hours?.[day] ?? [];

  for (const [openStr, closeStr] of ranges) {
    const open = withTime(at, openStr);
    if (!open) continue;

    // close might be same day or next day (cross-midnight)
    let close = withTime(at, closeStr);
    if (!close) continue;

    // If close time is "earlier" than open, assume it closes next day (cross-midnight)
    if (close.getTime() <= open.getTime()) {
      close = new Date(close);
      close.setDate(close.getDate() + 1);
    }

    if (isWithinRange(at, open, close)) {
      return close;
    }
  }

  return null;
}

export function formatClosesIn(closeAt: Date, at: Date) {
  const ms = closeAt.getTime() - at.getTime();
  if (ms <= 0) return "Closed";

  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;

  if (h <= 0 && m <= 5) return "Closes very soon";
  if (h <= 0) return `Closes in ${m}m`;
  if (m === 0) return `Closes in ${h}h`;
  return `Closes in ${h}h ${m}m`;
}
