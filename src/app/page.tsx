"use client";

import { useEffect, useMemo, useState } from "react";
import type { Venue } from "@/lib/types";

type ApiResponse = { error: string } | { count: number; venues: Venue[] };

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * Builds a Google Maps directions deep link.
 * - Works on mobile (opens Maps app) and desktop (opens browser).
 * - If origin is provided, directions start from the user’s current coords.
 */
function directionsUrl(
  destinationAddress: string,
  origin?: { lat: number; lng: number }
) {
  const dest = encodeURIComponent(destinationAddress);
  if (!origin) {
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  }
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest}`;
}

export default function HomePage() {
  const [datetime, setDatetime] = useState<string>(() =>
    toDatetimeLocalValue(new Date())
  );
  const [suburb, setSuburb] = useState<string>("");
  const [category, setCategory] = useState<string>("");

  const [useNearMe, setUseNearMe] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [radius, setRadius] = useState<number>(2500);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [count, setCount] = useState<number>(0);

  const categories = useMemo(
    () => ["", "Restaurant", "Cafe", "Dessert", "Activity"],
    []
  );

  async function getMyLocation() {
    setError(null);

    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUseNearMe(true);
      },
      (e) => {
        setError(
          e.code === e.PERMISSION_DENIED
            ? "Location permission denied. Allow location access to use Near Me."
            : "Could not get your location."
        );
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  async function runSearch() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("datetime", datetime);
      if (category.trim()) params.set("category", category.trim());

      let endpoint = "/api/search-google";

      if (useNearMe) {
        if (!coords) {
          setLoading(false);
          setError("Click “Use Near Me” to fetch your location first.");
          return;
        }
        endpoint = "/api/search-nearby";
        params.set("lat", String(coords.lat));
        params.set("lng", String(coords.lng));
        params.set("radius", String(radius));
      } else {
        if (suburb.trim()) params.set("suburb", suburb.trim());
      }

      const res = await fetch(`${endpoint}?${params.toString()}`);
      const data: ApiResponse = await res.json();

      if (!res.ok) {
        setVenues([]);
        setCount(0);
        setError("error" in data ? data.error : "Search failed.");
        return;
      }

      if ("venues" in data) {
        setVenues(data.venues);
        setCount(data.count);
      }
    } catch {
      setError("Network error.");
      setVenues([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="h1">What Still Open Sydney</div>
          <div className="sub">
            Enter a time. Get venues that are open, with website links and
            directions.
          </div>
        </div>
        <div className="sub">Live (Google Places)</div>
      </div>

      <div className="panel">
        <div className="row">
          <div>
            <label>Date & time</label>
            <input
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
            />
          </div>

          <div>
            <label>Search mode</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setUseNearMe(false);
                  setError(null);
                }}
                disabled={loading}
              >
                Suburb
              </button>
              <button type="button" onClick={getMyLocation} disabled={loading}>
                Use Near Me
              </button>
              <div className="sub" style={{ alignSelf: "center" }}>
                {useNearMe
                  ? coords
                    ? `Near Me active (${radius}m)`
                    : "Near Me active (no coords yet)"
                  : "Suburb mode"}
              </div>
            </div>
          </div>

          {!useNearMe ? (
            <div>
              <label>Suburb (optional)</label>
              <input
                placeholder="e.g. Newtown, CBD, Surry Hills"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <label>Radius (meters)</label>
              <input
                type="number"
                min={200}
                max={50000}
                step={100}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 180, flex: "1 1 auto" }}>
              <label>Category (optional)</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "" ? "Any" : c}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end" }}>
              <button onClick={runSearch} disabled={loading}>
                {loading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10 }} className="sub">
          Showing <b>{count}</b> place(s) open at the selected time.
        </div>

        {error && (
          <div style={{ marginTop: 10, color: "#ffb4b4" }}>{error}</div>
        )}
      </div>

      <div className="grid">
        {venues.map((v) => (
          <div key={v.id} className="card">
            {/* ✅ Large image, title below */}
            {v.photoName ? (
              <img
                src={`/api/photo?name=${encodeURIComponent(v.photoName)}&w=900`}
                alt={v.name}
                loading="lazy"
                style={{
                  width: "100%",
                  height: 190,
                  objectFit: "cover",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "#0f0f0f",
                  marginBottom: 12,
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: 190,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "#0f0f0f",
                  marginBottom: 12,
                }}
              />
            )}

            <div style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0, lineHeight: 1.2 }}>{v.name}</h3>
              <div className="small" style={{ marginTop: 6 }}>
                {v.suburb}
              </div>
            </div>

            <div className="badges">
              <span className="badge">{v.category}</span>
              <span className="badge">Website</span>
            </div>

            <div className="actions">
              {v.website && (
                <a
                  className="actionBtn"
                  href={v.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  Website
                </a>
              )}

              <a
                className="actionBtn"
                href={directionsUrl(v.suburb, coords ?? undefined)}
                target="_blank"
                rel="noreferrer"
              >
                Directions
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="sub" style={{ marginTop: 14 }}>
        Tip: Directions opens your Maps app on mobile automatically. “Near Me”
        provides better routing from your current location.
      </div>

      <div
        className="sub"
        style={{
          marginTop: 6,
          opacity: 0.5,
          fontSize: "12px",
        }}
      >
        Made by Donny Chung
      </div>
    </div>
  );
}
