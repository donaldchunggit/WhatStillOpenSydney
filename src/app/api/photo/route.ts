import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isValidPhotoName(name: string) {
  // Expected format: places/{placeId}/photos/{photoId}
  return /^places\/[^/]+\/photos\/[^/]+$/.test(name);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  const w = url.searchParams.get("w") || "240";

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Missing GOOGLE_MAPS_API_KEY" },
      { status: 500 }
    );
  }

  if (!name) {
    return NextResponse.json({ error: "Missing photo name" }, { status: 400 });
  }

  if (!isValidPhotoName(name)) {
    return NextResponse.json(
      { error: "Invalid photo name format" },
      { status: 400 }
    );
  }

  // IMPORTANT:
  // Do NOT encodeURIComponent(name) here, because it contains slashes and must remain a path.
  const googleUrl = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${encodeURIComponent(
    w
  )}&key=${encodeURIComponent(key)}`;

  const res = await fetch(googleUrl);

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const bytes = await res.arrayBuffer();

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
