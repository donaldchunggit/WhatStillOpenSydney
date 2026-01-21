import type { DayKey, TimeRange } from "./types";

export function dayKeyFromDate(d: Date): DayKey {
  // JS: 0=Sun,1=Mon,...6=Sat
  const map: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()];
}

export function prevDayKey(day: DayKey): DayKey {
  const order: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const idx = order.indexOf(day);
  return order[(idx - 1 + order.length) % order.length];
}

function minutesFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return h * 60 + m;
}

/**
 * Returns true if a given day schedule is open at given minutes-of-day,
 * and also supports windows that cross midnight (close < open).
 */
function isOpenInRanges(ranges: TimeRange[], minutes: number): boolean {
  for (const [openStr, closeStr] of ranges) {
    const open = minutesFromHHMM(openStr);
    const close = minutesFromHHMM(closeStr);

    if (ranges.length === 0) continue;

    if (close === open) {
      // Treat "00:00-00:00" as closed (or 24h if you want). We'll treat as closed.
      continue;
    }

    if (close > open) {
      // Normal same-day window
      if (minutes >= open && minutes < close) return true;
    } else {
      // Cross-midnight window, e.g. 17:00-02:00
      // On the start day, open if minutes >= open (until midnight)
      // On the next day, open if minutes < close (handled elsewhere)
      if (minutes >= open) return true;
    }
  }
  return false;
}

/**
 * Checks if "open at" a particular Date in local time.
 * Logic:
 * - Check today's ranges normally.
 * - Also check previous day's ranges that cross midnight into today.
 */
export function isVenueOpenAt(
  hours: Record<DayKey, TimeRange[]>,
  at: Date
): boolean {
  const day = dayKeyFromDate(at);
  const minutes = at.getHours() * 60 + at.getMinutes();

  // 1) Check today's windows
  if (isOpenInRanges(hours[day] ?? [], minutes)) return true;

  // 2) Check previous day's cross-midnight spillover
  const prev = prevDayKey(day);
  const prevRanges = hours[prev] ?? [];
  for (const [openStr, closeStr] of prevRanges) {
    const open = minutesFromHHMM(openStr);
    const close = minutesFromHHMM(closeStr);

    // Spillover exists if close < open
    if (close < open) {
      if (minutes < close) return true;
    }
  }

  return false;
}
