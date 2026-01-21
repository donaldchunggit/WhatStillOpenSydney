import { NextResponse } from "next/server";
import type { DayKey, Hours, Venue } from "@/lib/types";
import { isVenueOpenAt } from "@/lib/time";

export const runtime = "nodejs";

/* ---------- helpers ---------- */

function parseDateTime(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(day: number): DayKey {
  const map: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[day] ?? "mon";
}

function hhmm(h?: number, m?: number) {
  return `${String(h ?? 0).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
}

function normalizeCloseHHMM(h?: number, m?: number) {
  // midnight close fix
  if ((h ?? 0) === 0 && (m ?? 0) === 0) return "24:00";
  return hhmm(h, m);
}

function googleHoursToHours(roh: any): Hours {
  const out: Hours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

  const periods = roh?.periods;
  if (!Array.isArray(periods)) return out;

  for (const p of periods) {
    const open = p?.open;
    const close = p?.close;
    if (!open || !close) continue;

    const d = dayKey(open.day);
    out[d].push([
      hhmm(open.hour, open.minute),
      normalizeCloseHHMM(close.hour, close.minute),
    ]);
  }
  return out;
}

function inferCategory(types: string[]): string {
  const t = new Set(types.map((x) => x.toLowerCase()));
  if (t.has("restaurant") || t.has("meal_takeaway") || t.has("meal_delivery")) return "Restaurant";
  if (t.has("cafe")) return "Cafe";
  if (t.has("bakery")) return "Dessert";
  if (t.has("tourist_attraction") || t.has("amusement_park") || t.has("bar") || t.has("night_club")) return "Activity";
  return "Activity";
}

function categoryToIncludedTypes(category: string): string[] {
  // Places API "includedTypes" expects Google place types.
  // Keep this MVP-simple.
  const c = category.trim().toLowerCase();
  if (!c) return []; // no filter

  if (c === "restaurant") return ["restaurant"];
  if (c === "cafe") return ["cafe"];
  if (c === "dessert") return ["bakery", "cafe"]; // approximation
  if (c === "activity") return ["tourist_attraction", "amusement_park"];
  return [];
}

/* ---------- Google Places (Nearby Search New) ---------- */

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
    body.includedTypes = args.includedTypes.slice(0, 5);
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      // FieldMask is required for Nearby Search (New). :contentReference[oaicite:1]{index=1}
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.types,places.regularOpeningHours",
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
    const radius = Number(url.searchParams.get("radius") || "2500"); // default 2.5km
    const category = (url.searchParams.get("category") || "").trim();

    if (!datetime) return NextResponse.json({ error: "Invalid datetime" }, { status: 400 });
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Missing/invalid lat/lng" }, { status: 400 });
    }
    if (!Number.isFinite(radius) || radius <= 0 || radius > 50000) {
      return NextResponse.json({ error: "Invalid radius (1..50000 meters)" }, { status: 400 });
    }

    const data = await googleNearbySearch({
      lat,
      lng,
      radiusM: radius,
      includedTypes: categoryToIncludedTypes(category),
    });

    const places = Array.isArray(data?.places) ? data.places : [];

    const venues: Venue[] = places.map((p: any) => {
      const types: string[] = Array.isArray(p?.types) ? p.types : [];
      return {
        id: p?.id ?? `${p?.displayName?.text ?? "unknown"}-${Math.random()}`,
        name: p?.displayName?.text ?? "Unknown",
        category: inferCategory(types),
        suburb: p?.formattedAddress ?? "",
        website: p?.websiteUri ?? "",
        bookingUrl: null,
        hours: googleHoursToHours(p?.regularOpeningHours),
      };
    });

    const openAtTime = venues
      .filter((v) => Boolean(v.website))
      .filter((v) => isVenueOpenAt(v.hours, datetime))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ count: openAtTime.length, venues: openAtTime });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
