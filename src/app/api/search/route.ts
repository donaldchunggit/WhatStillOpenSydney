import { NextResponse } from "next/server";
import venuesRaw from "@/data/venues.json";
import type { Venue } from "@/lib/types";
import { isVenueOpenAt } from "@/lib/time";

export const runtime = "nodejs";

function safeParseDateTime(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const datetime = url.searchParams.get("datetime");
  const suburb = (url.searchParams.get("suburb") || "").trim();
  const category = (url.searchParams.get("category") || "").trim();

  const at = safeParseDateTime(datetime);
  if (!at) {
    return NextResponse.json(
      { error: "Invalid or missing datetime. Use an ISO string from <input type='datetime-local'>." },
      { status: 400 }
    );
  }

  const venues = venuesRaw as Venue[];

  const filtered = venues
    .filter((v) => (suburb ? v.suburb.toLowerCase().includes(suburb.toLowerCase()) : true))
    .filter((v) => (category ? v.category.toLowerCase() === category.toLowerCase() : true))
    .filter((v) => isVenueOpenAt(v.hours, at));

  // Sort: booking first, then name
  filtered.sort((a, b) => {
    const ab = a.bookingUrl ? 0 : 1;
    const bb = b.bookingUrl ? 0 : 1;
    if (ab !== bb) return ab - bb;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({
    count: filtered.length,
    venues: filtered,
  });
}
