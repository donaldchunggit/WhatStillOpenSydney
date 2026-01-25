"use client";

import { useEffect, useMemo, useState } from "react";
import type { Venue, Hours, DayKey, TimeRange, Category } from "@/lib/types";

type ApiResponse = { error: string } | { count: number; venues: Venue[] };

/* ------------------ datetime helpers ------------------ */

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
 */
function directionsUrl(destinationAddress: string, origin?: { lat: number; lng: number }) {
  const dest = encodeURIComponent(destinationAddress);
  if (!origin) return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest}`;
}

/* ------------------ close-time helpers (client side) ------------------ */

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

  // Handle "24:00"
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

function getVenueCloseAt(hours: Hours, at: Date): Date | null {
  const day: DayKey = dayKeyFromDate(at);
  const ranges: TimeRange[] = hours?.[day] ?? [];

  for (const [openStr, closeStr] of ranges) {
    const open = withTime(at, openStr);
    if (!open) continue;

    let close = withTime(at, closeStr);
    if (!close) continue;

    // Cross-midnight
    if (close.getTime() <= open.getTime()) {
      close = new Date(close);
      close.setDate(close.getDate() + 1);
    }

    if (isWithinRange(at, open, close)) return close;
  }

  return null;
}

function formatClosesIn(closeAt: Date, at: Date) {
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

/* ------------------ EatClub helper ------------------ */

async function checkEatClub(
  name: string
): Promise<{ onEatClub: boolean; eatClubUrl: string | null }> {
  const res = await fetch(`/api/eatclub-check?name=${encodeURIComponent(name)}`);
  if (!res.ok) return { onEatClub: false, eatClubUrl: null };

  const data: unknown = await res.json();
  const obj = (data ?? {}) as { onEatClub?: unknown; eatClubUrl?: unknown };

  return {
    onEatClub: Boolean(obj.onEatClub),
    eatClubUrl: typeof obj.eatClubUrl === "string" ? obj.eatClubUrl : null,
  };
}

/* ------------------ Lightweight Scoring System ------------------ */

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Score uses only fields you actually have:
 * - "open longer" (minutes til close) -> strong weight
 * - EatClub bonus
 * - actionability bonus: has website / bookingUrl
 */
function scoreVenue(v: Venue, atDate: Date): number {
  // 1) Minutes until close (normalised to 0..1 using 4h cap)
  let openNorm = 0.5; // neutral if something goes wrong
  if (v.hours) {
    const closeAt = getVenueCloseAt(v.hours as Hours, atDate);
    if (closeAt) {
      const mins = Math.max(0, Math.floor((closeAt.getTime() - atDate.getTime()) / 60000));
      openNorm = clamp01(mins / 240);
    } else {
      openNorm = 0; // hours exist but not open => bad
    }
  }

  // 2) EatClub bonus (0/1)
  const eatClubNorm = v.onEatClub ? 1 : 0;

  // 3) Actionability bonus: website & bookingUrl
  const hasWebsite = Boolean(v.website && v.website.trim().length);
  const hasBooking = Boolean(v.bookingUrl && v.bookingUrl.trim().length);
  const actionNorm = clamp01((Number(hasWebsite) + Number(hasBooking)) / 2);

  // Weights (simple + explainable in an interview)
  const wOpen = 0.6;
  const wEat = 0.25;
  const wAction = 0.15;

  return wOpen * openNorm + wEat * eatClubNorm + wAction * actionNorm;
}

/**
 * Pick randomly from the top N% by score (keeps variety while improving quality).
 */
function pickFromTopScored(list: Venue[], atDate: Date, topFraction = 0.25): Venue {
  const scored = list
    .map((v) => ({ v, s: scoreVenue(v, atDate) }))
    .sort((a, b) => b.s - a.s);

  const n = Math.max(1, Math.ceil(scored.length * topFraction));
  const top = scored.slice(0, n).map((x) => x.v);
  return pickRandom(top);
}

/* ------------------ Page ------------------ */

export default function HomePage() {
  const [datetime, setDatetime] = useState<string>(() => toDatetimeLocalValue(new Date()));
  const [suburb, setSuburb] = useState<string>("");
  const [category, setCategory] = useState<Category | "">("");

  const [useNearMe, setUseNearMe] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState<number>(2500);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [count, setCount] = useState<number>(0);

  // Plan output
  const [nightPlan, setNightPlan] = useState<{
    restaurant?: Venue;
    activity?: Venue;
    bar?: Venue;
  } | null>(null);

  // force a re-render every minute so "Closes in ..." updates live
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const categories = useMemo(
    () => ["", "Restaurant", "Cafe", "Dessert", "Activity", "Bar"] as const,
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

  async function enrichEatClub(list: Venue[]) {
    const need = list.filter((v) => typeof v.onEatClub === "undefined");
    if (need.length === 0) return list;

    const out: Venue[] = [...list];

    const batchSize = 6;
    for (let i = 0; i < need.length; i += batchSize) {
      const batch = need.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (v) => {
          const r = await checkEatClub(v.name);
          return { id: v.id, ...r };
        })
      );

      for (const r of results) {
        const idx = out.findIndex((x) => x.id === r.id);
        if (idx >= 0) {
          out[idx] = {
            ...out[idx],
            onEatClub: r.onEatClub,
            eatClubUrl: r.eatClubUrl,
          };
        }
      }
    }

    return out;
  }

  async function runSearch() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("datetime", datetime);
      if (category) params.set("category", category);

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
        setNightPlan(null);
        setCount(0);
        setError("error" in data ? data.error : "Search failed.");
        return;
      }

      if ("venues" in data) {
        setVenues(data.venues);
        setNightPlan(null);
        setCount(data.count);

        const enriched = await enrichEatClub(data.venues);
        setVenues(enriched);
      }
    } catch {
      setError("Network error.");
      setVenues([]);
      setNightPlan(null);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }

  async function planMyNight() {
    setLoading(true);
    setError(null);
    setNightPlan(null);

    try {
      const baseParams = new URLSearchParams();
      baseParams.set("datetime", datetime);

      if (useNearMe) {
        if (!coords) {
          setError("Location not available.");
          setLoading(false);
          return;
        }
        baseParams.set("lat", String(coords.lat));
        baseParams.set("lng", String(coords.lng));
        baseParams.set("radius", String(radius));
      } else {
        if (suburb.trim()) baseParams.set("suburb", suburb.trim());
      }

      const endpoint = useNearMe ? "/api/search-nearby" : "/api/search-google";

      const fetchCategory = async (cat: Category): Promise<Venue[]> => {
        const p = new URLSearchParams(baseParams);
        p.set("category", cat);

        const r = await fetch(`${endpoint}?${p.toString()}`);
        if (!r.ok) return [];

        const d: ApiResponse = await r.json();
        if (!("venues" in d)) return [];

        return d.venues;
      };

      const [restaurantsRaw, activitiesRaw, barsRaw] = await Promise.all([
        fetchCategory("Restaurant"),
        fetchCategory("Activity"),
        fetchCategory("Bar"),
      ]);

      if (!restaurantsRaw.length || !activitiesRaw.length || !barsRaw.length) {
        setError("Not enough open venues to plan a full night. Try another time.");
        setLoading(false);
        return;
      }

      // Enrich so EatClub can influence scoring
      const [restaurants, activities, bars] = await Promise.all([
        enrichEatClub(restaurantsRaw),
        enrichEatClub(activitiesRaw),
        enrichEatClub(barsRaw),
      ]);

      const atDate = new Date(datetime);

      // Weighted picks (top 25% by score)
      const restaurant = pickFromTopScored(restaurants, atDate, 0.25);
      const used = new Set<string>([restaurant.id]);

      const activitiesNoDup = activities.filter((v) => !used.has(v.id));
      const activityPool = activitiesNoDup.length ? activitiesNoDup : activities;
      const activity = pickFromTopScored(activityPool, atDate, 0.25);
      used.add(activity.id);

      const barsNoDup = bars.filter((v) => !used.has(v.id));
      const barPool = barsNoDup.length ? barsNoDup : bars;
      const bar = pickFromTopScored(barPool, atDate, 0.25);

      setNightPlan({ restaurant, activity, bar });
    } catch {
      setError("Could not plan night. Network error.");
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
          <div className="sub">Enter a time. Get venues that are open, with website links and directions.</div>
        </div>

        <div className="sub">Live (Google Places)</div>
      </div>

      {nightPlan && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="sub" style={{ marginBottom: 10 }}>
            Suggested night plan (weighted for better picks):
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {(["restaurant", "activity", "bar"] as const).map((k) => {
              const v = nightPlan[k];
              if (!v) return null;

              const label = k === "restaurant" ? "Food" : k === "activity" ? "Activity" : "Bar";

              return (
                <div
                  key={k}
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 16,
                    padding: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
                    <div style={{ fontWeight: 700 }}>{v.name}</div>
                    <div className="small" style={{ marginTop: 4 }}>
                      {v.suburb}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {v.website && (
                      <a className="actionBtn" href={v.website} target="_blank" rel="noreferrer">
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
                    {v.onEatClub && v.eatClubUrl && (
                      <a className="actionBtn" href={v.eatClubUrl} target="_blank" rel="noreferrer">
                        EatClub
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sub" style={{ marginTop: 10, opacity: 0.7 }}>
            Tip: Re-roll for variety; results are sampled from the best-scoring options.
          </div>
        </div>
      )}

      <div className="panel">
        <div
          className="row"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <label>Date & time</label>
            <input
              type="datetime-local"
              value={datetime}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDatetime(e.target.value)}
              style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ minWidth: 0 }}>
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
            <div style={{ minWidth: 0 }}>
              <label>Suburb (optional)</label>
              <input
                placeholder="e.g. Newtown, CBD, Surry Hills"
                value={suburb}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSuburb(e.target.value)}
                style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
              />
            </div>
          ) : (
            <div style={{ minWidth: 0 }}>
              <label>Radius (meters)</label>
              <input
                type="number"
                min={200}
                max={50000}
                step={100}
                value={radius}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRadius(Number(e.target.value))}
                style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
            <div style={{ minWidth: 180, flex: "1 1 auto" }}>
              <label>Category (optional)</label>
              <select
                value={category}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setCategory(e.target.value as Category | "")
                }
                style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "" ? "Any" : c}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <button onClick={runSearch} disabled={loading}>
                {loading ? "Searching..." : "Search"}
              </button>

              <button
                type="button"
                onClick={planMyNight}
                disabled={loading || venues.length === 0}
                title="Weighted picks for Food, Activity and Bar"
                style={{
                  background: "#FFD54F",
                  color: "#111",
                  fontWeight: 800,
                  borderRadius: 10,
                  padding: "10px 14px",
                  border: "none",
                  cursor: loading || venues.length === 0 ? "not-allowed" : "pointer",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
                  whiteSpace: "nowrap",
                }}
              >
                Plan my night ✨
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10 }} className="sub">
          Showing <b>{count}</b> place(s) open at the selected time.
        </div>

        {error && <div style={{ marginTop: 10, color: "#ffb4b4" }}>{error}</div>}
      </div>

      <div className="grid">
        {venues.map((v) => {
          const atDate = new Date(datetime);
          const closeAt = v.hours ? getVenueCloseAt(v.hours as Hours, atDate) : null;

          return (
            <div key={v.id} className="card">
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

                {closeAt && (
                  <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>
                    {formatClosesIn(closeAt, atDate)}
                  </div>
                )}
              </div>

              <div className="badges">
                <span className="badge">{v.category}</span>

                {v.onEatClub && (
                  <span className="badge" style={{ borderColor: "rgba(255,255,255,0.25)" }}>
                    EatClub
                  </span>
                )}
              </div>

              <div className="actions">
                {v.website && (
                  <a className="actionBtn" href={v.website} target="_blank" rel="noreferrer">
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

                {v.onEatClub && v.eatClubUrl && (
                  <a className="actionBtn" href={v.eatClubUrl} target="_blank" rel="noreferrer">
                    EatClub
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sub" style={{ marginTop: 14 }}>
        Tip: Directions opens your Maps app on mobile automatically. “Near Me” provides better routing
        from your current location.
      </div>

      <div className="sub" style={{ marginTop: 6, opacity: 0.5, fontSize: "12px" }}>
        Made by Donny Chung
      </div>
    </div>
  );
}
