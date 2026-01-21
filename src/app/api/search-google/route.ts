import { NextResponse } from "next/server";
import type { Venue, DayKey, Hours } from "@/lib/types";
import { isVenueOpenAt } from "@/lib/time";

export const runtime = "nodejs";

/* ---------- helpers ---------- */

function parseDateTime(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(day: number): DayKey {
  // Google: 0=Sun..6=Sat
  const map: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[day] ?? "mon";
}

function hhmm(h?: number, m?: number) {
  return `${String(h ?? 0).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
}

function normalizeCloseHHMM(h?: number, m?: number) {
  // Treat 00:00 close as end-of-day (24:00), otherwise it looks "closed immediately".
  if ((h ?? 0) === 0 && (m ?? 0) === 0) return "24:00";
  return hhmm(h, m);
}

/**
 * Convert Google regularOpeningHours.periods into our Hours format.
 * - Stores each period under the OPEN day.
 * - Supports cross-midnight periods naturally (close < open).
 * - Fixes midnight close (00:00) -> 24:00.
 */
function googleHoursToHours(roh: any): Hours {
  const out: Hours = {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  };

  const periods = roh?.periods;
  if (!Array.isArray(periods)) return out;

  for (const p of periods) {
    const open = p?.open;
    const close = p?.close;

    // If Google doesn't provide a close, skip for MVP.
    if (!open || !close) continue;

    const d = dayKey(open.day);

    const openTime = hhmm(open.hour, open.minute);

    // If close.day differs from open.day, it's still fine:
    // We'll store close time as HH:MM; if it's next day it will usually be smaller than openTime,
    // which your isVenueOpenAt() already handles as cross-midnight.
    const closeTime = normalizeCloseHHMM(close.hour, close.minute);

    out[d].push([openTime, closeTime]);
  }

  return out;
}

/* ---------- Google Places call ---------- */

async function googleTextSearch(query: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_MAPS_API_KEY");

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.websiteUri,places.formattedAddress,places.types,places.regularOpeningHours",
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: {
        circle: {
          center: { latitude: -33.8688, longitude: 151.2093 },
          radius: 25000,
        },
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t);
  }

  return res.json();
}

/* ---------- API handler ---------- */

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const datetime = parseDateTime(url.searchParams.get("datetime"));
    const suburb = (url.searchParams.get("suburb") || "Sydney").trim();
    const category = (url.searchParams.get("category") || "").trim();

    if (!datetime) {
      return NextResponse.json({ error: "Invalid datetime" }, { status: 400 });
    }

    const q = category
      ? `${category} in ${suburb}, Sydney`
      : `restaurants and activities in ${suburb}, Sydney`;

    const data = await googleTextSearch(q);
    const places = Array.isArray(data?.places) ? data.places : [];

    const venues: Venue[] = places.map((p: any) => {
      const types: string[] = Array.isArray(p?.types) ? p.types : [];

      const inferredCategory =
        types.includes("restaurant")
          ? "Restaurant"
          : types.includes("cafe")
          ? "Cafe"
          : types.includes("bakery")
          ? "Dessert"
          : types.includes("tourist_attraction")
          ? "Activity"
          : "Activity";

      return {
        id: p?.id ?? `${p?.displayName?.text ?? "unknown"}-${Math.random()}`,
        name: p?.displayName?.text || "Unknown",
        category: inferredCategory,
        suburb: p?.formattedAddress || suburb,
        website: p?.websiteUri || "",
        bookingUrl: null,
        hours: googleHoursToHours(p?.regularOpeningHours),
      };
    });

    const openAtTime = venues
      .filter((v) => Boolean(v.website))
      .filter((v) => (category ? v.category.toLowerCase() === category.toLowerCase() : true))
      .filter((v) => isVenueOpenAt(v.hours, datetime))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      count: openAtTime.length,
      venues: openAtTime,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
