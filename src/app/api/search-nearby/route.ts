// app/api/search-nearby/route.ts
import { NextResponse } from "next/server";
import type { DayKey, Hours, Venue, Category } from "@/lib/types";
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
 * - Activities are only true activities (attractions, cinema, museum, etc.)
 */
function inferCategory(types: string[]): Category {
  const t = new Set(types.map((x) => String(x).toLowerCase()));

  // Food
  if (t.has("restaurant") || t.has("meal_takeaway") || t.has("meal_delivery")) {
    return "Restaurant";
  }
  if (t.has("cafe")) return "Cafe";
  if (t.has("bakery") || t.has("ice_cream_shop") || t.has("dessert_shop")) {
    return "Dessert";
  }

  // Bars / nightlife (separate)
  if (t.has("bar") || t.has("night_club") || t.has("pub")) {
    return "Bar";
  }

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

  // Default: if Google doesn't give a clean type, treat as Activity (safe fallback)
  return "Activity";
}

function categoryToIncludedTypes(category: string): string[] {
  // Places API "includedTypes" expects Google place types.
  // Keep this MVP-simple but strict enough to avoid bars showing as activities.
  const c = category.trim().toLowerCase();
  if (!c) return []; // no filter

  if (c === "restaurant") return ["restaurant"];
  if (c === "cafe") return ["cafe"];
  if (c === "dessert") return ["bakery", "ice_cream_shop"]; // approximation
  if (c === "bar") return ["bar", "night_club", "pub"];

  if (c === "activity")
    return [
      "tourist_attraction",
      "museum",
      "art_gallery",
      "movie_theater",
      "bowling_alley",
      "amusement_park",
      "zoo",
      "aquarium",
      "stadium",
      "park",
      "spa",
      "gym",
      "casino",
      "escape_room",
    ];

  return [];
}

/**
 * Haversine distance (meters)
 */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------- Google Places: Nearby Search (New) ---------- */

async function googleNearbySearch(args: {
  lat: number;
  lng: number;
  radiusM: number;
  includedTypes?: string[];
}) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_MAPS_API_KEY");

  const body: any = {
    locationRestriction: {
      circle: {
        center: { latitude: args.lat, longitude: args.lng },
        radius: args.radiusM,
      },
    },
  };

  if (args.includedTypes && args.includedTypes.length > 0) {
    // API limits includedTypes count; keep it small to avoid 400s.
    body.includedTypes = args.includedTypes.slice(0, 5);
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      // ✅ ADD scoring + geometry fields
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.types,places.regularOpeningHours,places.photos,places.rating,places.userRatingCount,places.priceLevel,places.location",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t);
  }

  return res.json();
}

/* ---------- handler ---------- */

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const datetime = parseDateTime(url.searchParams.get("datetime"));
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const radius = Number(url.searchParams.get("radius") || "2500");
    const category = (url.searchParams.get("category") || "").trim();

    if (!datetime) {
      return NextResponse.json({ error: "Invalid datetime" }, { status: 400 });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Missing/invalid lat/lng" }, { status: 400 });
    }
    if (!Number.isFinite(radius) || radius <= 0 || radius > 50000) {
      return NextResponse.json(
        { error: "Invalid radius (1..50000 meters)" },
        { status: 400 }
      );
    }

    const data = await googleNearbySearch({
      lat,
      lng,
      radiusM: radius,
      includedTypes: categoryToIncludedTypes(category),
    });

    const places = Array.isArray(data?.places) ? data.places : [];

    const origin = { lat, lng };

    const venues: Venue[] = places.map((p: any) => {
      const types: string[] = Array.isArray(p?.types) ? p.types : [];
      const loc = p?.location;

      const vLat = typeof loc?.latitude === "number" ? loc.latitude : null;
      const vLng = typeof loc?.longitude === "number" ? loc.longitude : null;

      // Optional: precompute distance for scoring
      const dist =
        typeof vLat === "number" && typeof vLng === "number"
          ? Math.round(distanceMeters(origin, { lat: vLat, lng: vLng }))
          : null;

      return {
        id: p?.id ?? `${p?.displayName?.text ?? "unknown"}-${Math.random()}`,
        name: p?.displayName?.text ?? "Unknown",
        category: inferCategory(types),
        suburb: p?.formattedAddress ?? "",
        website: p?.websiteUri ?? "",
        bookingUrl: null,
        hours: googleHoursToHours(p?.regularOpeningHours),
        photoName: p?.photos?.[0]?.name ?? null,

        // ✅ scoring fields
        rating: typeof p?.rating === "number" ? p.rating : null,
        userRatingsTotal: typeof p?.userRatingCount === "number" ? p.userRatingCount : null,
        priceLevel: typeof p?.priceLevel === "number" ? p.priceLevel : null,
        lat: vLat,
        lng: vLng,

        // ✅ optional (only keep if you want it in Venue)
        // distanceM: dist,
      };
    });

    // ✅ allow true Activities even if they have no website
    const openAtTime = venues
      .filter((v) => (v.category === "Activity" ? true : Boolean(v.website)))
      .filter((v) => isVenueOpenAt(v.hours, datetime))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ count: openAtTime.length, venues: openAtTime });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
