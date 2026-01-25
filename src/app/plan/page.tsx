"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

type PlanItem = {
  id: string;
  name: string | null;
  suburb: string | null; // we treat this as address/location string
  website: string | null;
  eatClubUrl: string | null;
};

function directionsUrl(destinationAddress: string) {
  const dest = encodeURIComponent(destinationAddress);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

function getString(sp: URLSearchParams, key: string) {
  const v = sp.get(key);
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Google Calendar "TEMPLATE" link
 * dates format: YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ
 */
function toGCalDate(dt: Date) {
  // ISO: 2026-01-25T00:02:00.000Z -> 20260125T000200Z
  return dt.toISOString().replace(/[-:]/g, "").replace(".000", "");
}

function gcalEventUrl(args: {
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  details?: string | null;
}) {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const dates = `${toGCalDate(args.start)}/${toGCalDate(args.end)}`;

  const p = new URLSearchParams();
  p.set("action", "TEMPLATE");
  p.set("text", args.title);
  p.set("dates", dates);

  if (args.location) p.set("location", args.location);
  if (args.details) p.set("details", args.details);

  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export default function SharedPlanPage() {
  const sp = useSearchParams();

  // Convert to URLSearchParams once (useSearchParams is read-only wrapper)
  const params = useMemo(() => new URLSearchParams(sp.toString()), [sp]);

  // Required-ish params
  const d = getString(params, "d");
  const r = getString(params, "r");
  const a = getString(params, "a");
  const b = getString(params, "b");

  // Fallback display fields (optional)
  const restaurant: PlanItem = {
    id: r ?? "",
    name: getString(params, "rn"),
    suburb: getString(params, "rs"),
    website: getString(params, "rw"),
    eatClubUrl: getString(params, "re"),
  };

  const activity: PlanItem = {
    id: a ?? "",
    name: getString(params, "an"),
    suburb: getString(params, "as"),
    website: getString(params, "aw"),
    eatClubUrl: getString(params, "ae"),
  };

  const bar: PlanItem = {
    id: b ?? "",
    name: getString(params, "bn"),
    suburb: getString(params, "bs"),
    website: getString(params, "bw"),
    eatClubUrl: getString(params, "be"),
  };

  const datetimeLabel = (() => {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d; // fallback to raw string
    return dt.toLocaleString();
  })();

  // Valid if we have datetime AND either:
  // - all three IDs (r/a/b) OR
  // - fallback details (names/locations) for all 3 items
  const hasAllIds = Boolean(r && a && b);
  const hasFallback =
    Boolean(restaurant.name || restaurant.suburb) &&
    Boolean(activity.name || activity.suburb) &&
    Boolean(bar.name || bar.suburb);

  const isValid = Boolean(d && (hasAllIds || hasFallback));

  if (!isValid) {
    return (
      <div className="container">
        <div className="header">
          <div>
            <div className="h1">Shared Night Plan</div>
            <div className="sub">Invalid or incomplete link</div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="sub" style={{ marginBottom: 8 }}>
            This link is missing required parameters. Please re-share from the homepage.
          </div>

          <div className="sub" style={{ opacity: 0.7 }}>
            Required: <b>d</b> and either <b>r/a/b</b> or fallback details (<b>rn/an/bn</b> etc.)
          </div>

          <div style={{ marginTop: 12 }}>
            <a className="actionBtn" href="/">
              Back to homepage
            </a>
          </div>
        </div>
      </div>
    );
  }

  const fullUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}${window.location.search}`
      : "";

  const Card = ({
    label,
    item,
  }: {
    label: "Food" | "Activity" | "Bar";
    item: PlanItem;
  }) => {
    const title = item.name ?? (item.id ? `(ID: ${item.id})` : "(Unknown)");
    const subtitle = item.suburb ?? "Sydney";

    return (
      <div
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
          <div style={{ fontWeight: 800 }}>{title}</div>
          <div className="small" style={{ marginTop: 4 }}>
            {subtitle}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {item.website && (
            <a className="actionBtn" href={item.website} target="_blank" rel="noreferrer">
              Website
            </a>
          )}
          <a className="actionBtn" href={directionsUrl(subtitle)} target="_blank" rel="noreferrer">
            Directions
          </a>
          {item.eatClubUrl && (
            <a className="actionBtn" href={item.eatClubUrl} target="_blank" rel="noreferrer">
              EatClub
            </a>
          )}
        </div>
      </div>
    );
  };

  // ---- Google Calendar: 3 events, 1 hour each ----
  const calendarLinks = (() => {
    if (!d) return null;

    const start0 = new Date(d);
    if (Number.isNaN(start0.getTime())) return null;

    const end0 = new Date(start0);
    end0.setHours(end0.getHours() + 1);

    const start1 = new Date(start0);
    start1.setHours(start1.getHours() + 1);
    const end1 = new Date(start1);
    end1.setHours(end1.getHours() + 1);

    const start2 = new Date(start0);
    start2.setHours(start2.getHours() + 2);
    const end2 = new Date(start2);
    end2.setHours(end2.getHours() + 1);

    const dinnerTitle = `Dinner — ${restaurant.name ?? "Venue"}`;
    const actTitle = `Activity — ${activity.name ?? "Venue"}`;
    const drinksTitle = `Drinks — ${bar.name ?? "Venue"}`;

    const dinnerDetails = [
      restaurant.website ? `Website: ${restaurant.website}` : null,
      restaurant.eatClubUrl ? `EatClub: ${restaurant.eatClubUrl}` : null,
      fullUrl ? `Shared plan: ${fullUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const actDetails = [
      activity.website ? `Website: ${activity.website}` : null,
      fullUrl ? `Shared plan: ${fullUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const drinksDetails = [
      bar.website ? `Website: ${bar.website}` : null,
      bar.eatClubUrl ? `EatClub: ${bar.eatClubUrl}` : null,
      fullUrl ? `Shared plan: ${fullUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      dinner: gcalEventUrl({
        title: dinnerTitle,
        start: start0,
        end: end0,
        location: restaurant.suburb,
        details: dinnerDetails || null,
      }),
      activity: gcalEventUrl({
        title: actTitle,
        start: start1,
        end: end1,
        location: activity.suburb,
        details: actDetails || null,
      }),
      drinks: gcalEventUrl({
        title: drinksTitle,
        start: start2,
        end: end2,
        location: bar.suburb,
        details: drinksDetails || null,
      }),
    };
  })();

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="h1">Shared Night Plan</div>
          <div className="sub">{datetimeLabel ? `For: ${datetimeLabel}` : "Plan details"}</div>
        </div>

        <a className="actionBtn" href="/">
          Make my own plan
        </a>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <Card label="Food" item={restaurant} />
          <Card label="Activity" item={activity} />
          <Card label="Bar" item={bar} />
        </div>

        {calendarLinks && (
          <div style={{ marginTop: 14 }}>
            <div className="sub" style={{ marginBottom: 8 }}>
              Add to Google Calendar (3 events, 1 hour each):
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="actionBtn" href={calendarLinks.dinner} target="_blank" rel="noreferrer">
                Add Dinner
              </a>
              <a className="actionBtn" href={calendarLinks.activity} target="_blank" rel="noreferrer">
                Add Activity
              </a>
              <a className="actionBtn" href={calendarLinks.drinks} target="_blank" rel="noreferrer">
                Add Drinks
              </a>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button
            type="button"
            onClick={async () => {
              if (!fullUrl) return;
              const ok = await copyText(fullUrl);
              if (!ok) {
                window.prompt("Copy this link:", fullUrl);
                return;
              }
              alert("Link copied.");
            }}
          >
            Copy this link
          </button>

          {fullUrl && (
            <a className="actionBtn" href={fullUrl} target="_blank" rel="noreferrer">
              Open in new tab
            </a>
          )}
        </div>

        <div className="sub" style={{ marginTop: 10, opacity: 0.7 }}>
          Note: If names are missing, the share link didn’t include fallback details. Re-share from
          the homepage.
        </div>
      </div>
    </div>
  );
}
