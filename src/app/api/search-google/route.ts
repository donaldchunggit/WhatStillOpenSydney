// app/api/search-google/route.ts
import { NextResponse } from "next/server";
import type { Venue, DayKey, Hours, Category } from "@/lib/types";
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
  const out: Hours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

  const periods = roh?.periods;
  if (!Array.isArray(periods)) return out;

  for (const p of periods) {
    const open = p?.open;
    const close = p?.close;
    if (!open || !close) continue;

    const d = dayKey(open.day);
    const openTime = hhmm(open.hour, open.minute);
    const closeTime = normalizeCloseHHMM(close.hour, close.minute);

    out[d].push([openTime, closeTime]);
  }

  return out;
}

/**
 * STRICT category inference:
 * - Bars are "Bar" (not Activity)
 * - Activity is only true activities (museum/cinema/attractions/parks/etc.)
 */
function inferCategory(types: string[]): Category {
  const t = new Set(types.map((x) => String(x).toLowerCase()));

  // Food
  if (t.has("restaurant") || t.has("meal_takeaway") || t.has("meal_delivery")) return "Restaurant";
  if (t.has("cafe")) return "Cafe";
  if (t.has("bakery") || t.has("ice_cream_shop") || t.has("dessert_shop")) return "Dessert";

  // Bars / nightlife (separate)
  if (t.has("bar") || t.has("night_club") || t.has("pub")) return "Bar";

  // Strict activities
  if (
    t.has("tourist_attraction") ||
    t.has("museum") ||
    t.has("art_gallery") ||
    t.has("movie_theater") ||
    t.has("bowling_alley") ||
    t.has("amusement_park") ||
    t.has("zoo") ||
    t.has("aquarium") ||
    t.has("stadium") ||
    t.has("park") ||
    t.has("spa") ||
    t.has("gym") ||
    t.has("casino") ||
    t.has("escape_room")
  ) {
    return "Activity";
  }

  // Default fallback (keeps UI stable)
  return "Activity";
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
      // ✅ add scoring fields + geometry
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.websiteUri,places.formattedAddress,places.types,places.regularOpeningHours,places.photos,places.rating,places.userRatingCount,places.priceLevel,places.location",
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
      const loc = p?.location;

      return {
        id: p?.id ?? `${p?.displayName?.text ?? "unknown"}-${Math.random()}`,
        name: p?.displayName?.text || "Unknown",
        category: inferCategory(types),
        suburb: p?.formattedAddress || suburb,
        website: p?.websiteUri || "",
        bookingUrl: null,
        hours: googleHoursToHours(p?.regularOpeningHours),
        photoName: p?.photos?.[0]?.name ?? null,

        // ✅ new fields (safe if missing)
        rating: typeof p?.rating === "number" ? p.rating : null,
        userRatingsTotal: typeof p?.userRatingCount === "number" ? p.userRatingCount : null,
        priceLevel: typeof p?.priceLevel === "number" ? p.priceLevel : null,
        lat: typeof loc?.latitude === "number" ? loc.latitude : null,
        lng: typeof loc?.longitude === "number" ? loc.longitude : null,
      };
    });

    // ✅ allow Activities even if no website
    const openAtTime = venues
      .filter((v) => (v.category === "Activity" ? true : Boolean(v.website)))
      .filter((v) =>
        category ? v.category.toLowerCase() === category.toLowerCase() : true
      )
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
