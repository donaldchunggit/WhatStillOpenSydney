"use client";

import { useEffect, useMemo, useState } from "react";

type PlanItem = {
  id: string;
  name: string | null;
  suburb: string | null; // you store formattedAddress in this field
  website: string | null;
  eatClubUrl: string | null;
};

function directionsUrl(destinationAddress: string) {
  const dest = encodeURIComponent(destinationAddress);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

function getString(sp: URLSearchParams, key: string) {
  const v = sp.get(key);
  if (v == null) return null;
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

/* ------------------ Google Calendar helpers ------------------ */

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Google Calendar expects dates like: YYYYMMDDTHHMMSSZ (UTC).
 */
function toGCalDateUTC(d: Date) {
  return (
    d.getUTCFullYear() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

/**
 * Builds a Google Calendar "TEMPLATE" URL for a single event.
 * Uses:
 * - text: title
 * - dates: start/end UTC
 * - details: description
 * - location: venue address (or suburb string you stored)
 */
function googleCalendarUrl(args: {
  title: string;
  start: Date;
  end: Date;
  details?: string;
  location?: string;
}) {
  const p = new URLSearchParams();
  p.set("action", "TEMPLATE");
  p.set("text", args.title);
  p.set("dates", `${toGCalDateUTC(args.start)}/${toGCalDateUTC(args.end)}`);
  if (args.details) p.set("details", args.details);
  if (args.location) p.set("location", args.location);

  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

type ParsedPlan = {
  isValid: boolean;
  datetimeRaw: string | null;
  datetimeLabel: string | null;
  datetimeDate: Date | null;
  restaurant: PlanItem;
  activity: PlanItem;
  bar: PlanItem;
  fullUrl: string;
};

export default function SharedPlanPage() {
  // prerender-safe
  const [mounted, setMounted] = useState(false);
  const [plan, setPlan] = useState<ParsedPlan | null>(null);

  useEffect(() => {
    setMounted(true);

    const sp = new URLSearchParams(window.location.search);

    // Required params
    const d = getString(sp, "d");
    const r = getString(sp, "r");
    const a = getString(sp, "a");
    const b = getString(sp, "b");

    // Parse date safely
    const dt = d ? new Date(d) : null;
    const dtOk = Boolean(dt && !Number.isNaN(dt.getTime()));

    // Valid link means: d parses + r/a/b exist (names/addresses are optional)
    const isValid = Boolean(dtOk && r && a && b);

    // Fallback display fields (optional)
    const restaurant: PlanItem = {
      id: r ?? "",
      name: getString(sp, "rn"),
      suburb: getString(sp, "rs"),
      website: getString(sp, "rw"),
      eatClubUrl: getString(sp, "re"),
    };

    const activity: PlanItem = {
      id: a ?? "",
      name: getString(sp, "an"),
      suburb: getString(sp, "as"),
      website: getString(sp, "aw"),
      eatClubUrl: getString(sp, "ae"),
    };

    const bar: PlanItem = {
      id: b ?? "",
      name: getString(sp, "bn"),
      suburb: getString(sp, "bs"),
      website: getString(sp, "bw"),
      eatClubUrl: getString(sp, "be"),
    };

    const datetimeLabel = (() => {
      if (!dtOk || !dt) return d ?? null;
      return dt.toLocaleString();
    })();

    setPlan({
      isValid,
      datetimeRaw: d,
      datetimeLabel,
      datetimeDate: dtOk ? dt : null,
      restaurant,
      activity,
      bar,
      fullUrl: window.location.href,
    });
  }, []);

  const Card = useMemo(() => {
    return function CardInner({
      label,
      item,
    }: {
      label: "Food" | "Activity" | "Bar";
      item: PlanItem;
    }) {
      const title = item.name ?? `(ID: ${item.id})`;
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
  }, []);

  // prerender-safe placeholder
  if (!mounted || !plan) {
    return (
      <div className="container">
        <div className="header">
          <div>
            <div className="h1">Shared Night Plan</div>
            <div className="sub">Loading...</div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="sub" style={{ opacity: 0.7 }}>
            Preparing your plan from the link.
          </div>
        </div>
      </div>
    );
  }

  if (!plan.isValid) {
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
            Required: <b>d</b> (valid date), <b>r</b>, <b>a</b>, <b>b</b>
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

  // Build 3 calendar events: Dinner (t), Activity (t+1h), Drinks (t+2h), each 1 hour.
  const dinnerStart = plan.datetimeDate!;
  const dinnerEnd = addMinutes(dinnerStart, 60);

  const activityStart = addMinutes(dinnerStart, 60);
  const activityEnd = addMinutes(activityStart, 60);

  const drinksStart = addMinutes(dinnerStart, 120);
  const drinksEnd = addMinutes(drinksStart, 60);

  const dinnerTitle = `Dinner — ${plan.restaurant.name ?? "Restaurant"}`;
  const activityTitle = `Activity — ${plan.activity.name ?? "Activity"}`;
  const drinksTitle = `Drinks — ${plan.bar.name ?? "Bar"}`;

  const dinnerCalUrl = googleCalendarUrl({
    title: dinnerTitle,
    start: dinnerStart,
    end: dinnerEnd,
    location: plan.restaurant.suburb ?? "Sydney",
    details: [
      plan.restaurant.website ? `Website: ${plan.restaurant.website}` : "",
      plan.restaurant.eatClubUrl ? `EatClub: ${plan.restaurant.eatClubUrl}` : "",
      `Share link: ${plan.fullUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const activityCalUrl = googleCalendarUrl({
    title: activityTitle,
    start: activityStart,
    end: activityEnd,
    location: plan.activity.suburb ?? "Sydney",
    details: [
      plan.activity.website ? `Website: ${plan.activity.website}` : "",
      plan.activity.eatClubUrl ? `EatClub: ${plan.activity.eatClubUrl}` : "",
      `Share link: ${plan.fullUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const drinksCalUrl = googleCalendarUrl({
    title: drinksTitle,
    start: drinksStart,
    end: drinksEnd,
    location: plan.bar.suburb ?? "Sydney",
    details: [
      plan.bar.website ? `Website: ${plan.bar.website}` : "",
      plan.bar.eatClubUrl ? `EatClub: ${plan.bar.eatClubUrl}` : "",
      `Share link: ${plan.fullUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="h1">Shared Night Plan</div>
          <div className="sub">{plan.datetimeLabel ? `For: ${plan.datetimeLabel}` : "Plan details"}</div>
        </div>

        <a className="actionBtn" href="/">
          Make my own plan
        </a>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <Card label="Food" item={plan.restaurant} />
          <Card label="Activity" item={plan.activity} />
          <Card label="Bar" item={plan.bar} />
        </div>

        {/* Share controls */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button
            type="button"
            onClick={async () => {
              const ok = await copyText(plan.fullUrl);
              if (!ok) {
                window.prompt("Copy this link:", plan.fullUrl);
                return;
              }
              alert("Link copied.");
            }}
          >
            Copy this link
          </button>

          <a className="actionBtn" href={plan.fullUrl} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        </div>

        {/* Google Calendar controls */}
        <div className="sub" style={{ marginTop: 16, marginBottom: 8 }}>
          Add to Google Calendar (3 events, 1 hour each):
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="actionBtn" href={dinnerCalUrl} target="_blank" rel="noreferrer">
            Add Dinner
          </a>
          <a className="actionBtn" href={activityCalUrl} target="_blank" rel="noreferrer">
            Add Activity
          </a>
          <a className="actionBtn" href={drinksCalUrl} target="_blank" rel="noreferrer">
            Add Drinks
          </a>
        </div>

        <div className="sub" style={{ marginTop: 10, opacity: 0.7 }}>
          Note: Calendar times are based on the plan start time. Dinner starts at the plan time, Activity
          is +1h, Drinks is +2h.
        </div>

        <div className="sub" style={{ marginTop: 10, opacity: 0.7 }}>
          If names/addresses are missing, the share link didn’t include fallback details. Re-share from the
          homepage.
        </div>
      </div>
    </div>
  );
}
