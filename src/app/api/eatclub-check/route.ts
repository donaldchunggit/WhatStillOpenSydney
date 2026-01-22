import { NextResponse } from "next/server";
import { eatClubVenueUrl } from "@/lib/eatclub";

export const runtime = "nodejs";

/**
 * Checks if a venue likely exists on EatClub by trying the guessed /venue/<slug> URL.
 * Server-side to avoid browser CORS issues.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = (url.searchParams.get("name") || "").trim();

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const eatClubUrl = eatClubVenueUrl(name);

  async function exists(u: string): Promise<boolean> {
    // Attempt 1: HEAD
    try {
      const head = await fetch(u, {
        method: "HEAD",
        redirect: "follow",
        headers: { "User-Agent": "whatstillopensydney/1.0" },
      });
      if (head.status === 200) return true;
      if (head.status === 404) return false;
      // Some sites may not support HEAD well; fallback to GET
    } catch {
      // fall through to GET
    }

    // Attempt 2: GET (no scraping; just existence)
    try {
      const get = await fetch(u, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "whatstillopensydney/1.0",
          Range: "bytes=0-2048",
        },
      });

      if (get.status === 200 || get.status === 206) return true;
      if (get.status === 404) return false;

      return false;
    } catch {
      return false;
    }
  }

  const onEatClub = await exists(eatClubUrl);

  return NextResponse.json({
    name,
    onEatClub,
    eatClubUrl: onEatClub ? eatClubUrl : null,
  });
}
