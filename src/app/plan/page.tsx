"use client";

import { useMemo } from "react";

type PlanItem = {
  id: string;
  name: string | null;
  suburb: string | null;
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

/* ------------------ Google Calendar (3 separate events) ------------------ */

function toGCalUtc(d: Date) {
  // Google Calendar expects UTC format: YYYYMMDDTHHMMSSZ
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function addToGoogleCalendarUrl(opts: {
  title: string;
  details?: string;
  location?: string;
  start: Date;
  end: Date;
}) {
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", opts.title);
  params.set("dates", `${toGCalUtc(opts.start)}/${toGCalUtc(opts.end)}`);
  if (opts.details) params.set("details", opts.details);
  if (opts.location) params.set("location", opts.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function safeTitle(item: PlanItem) {
  return (item.name && item.name.trim().length ? item.name.trim() : null) ?? `(ID: ${item.id})`;
}

function safeSuburb(item: PlanItem) {
  return (item.suburb && item.suburb.trim().length ? item.suburb.trim() : null) ?? "Sydney";
}

export default function SharedPlanPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  // Required params
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

  const isValid = Boolean(d && r && a && b);

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
            Required: <b>d</b>, <b>r</b>, <b>a</b>, <b>b</b>
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

  const fullUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;

  // Build 3 separate 1-hour events: Dinner -> Activity -> Drinks
  const calLinks = (() => {
    const baseStart = new Date(d as string);
    if (Number.isNaN(baseStart.getTime())) return null;

    const dinnerStart = baseStart;
    const dinnerEnd = new Date(dinnerStart.getTime() + 60 * 60 * 1000);

    const activityStart = dinnerEnd;
    const activityEnd = new Date(activityStart.getTime() + 60 * 60 * 1000);

    const drinksStart = activityEnd;
    const drinksEnd = new Date(drinksStart.getTime() + 60 * 60 * 1000);

    const dinnerTitle = `Dinner: ${safeTitle(restaurant)}`;
    const activityTitle = `Activity: ${safeTitle(activity)}`;
    const drinksTitle = `Drinks: ${safeTitle(bar)}`;

    const dinnerLoc = safeSuburb(restaurant);
    const activityLoc = safeSuburb(activity);
    const drinksLoc = safeSuburb(bar);

    const mkDetails = (label: string, item: PlanItem) => {
      const lines: string[] = [];
      lines.push(`Shared Night Plan (${label})`);
      lines.push("");
      lines.push(`Place: ${safeTitle(item)}`);
      lines.push(`Suburb: ${safeSuburb(item)}`);
      if (item.website) lines.push(`Website: ${item.website}`);
      if (item.eatClubUrl) lines.push(`EatClub: ${item.eatClubUrl}`);
      lines.push("");
      lines.push(`Full plan link: ${fullUrl}`);
      return lines.join("\n");
    };

    return {
      dinner: addToGoogleCalendarUrl({
        title: dinnerTitle,
        location: dinnerLoc,
        details: mkDetails("Dinner", restaurant),
        start: dinnerStart,
        end: dinnerEnd,
      }),
      activity: addToGoogleCalendarUrl({
        title: activityTitle,
        location: activityLoc,
        details: mkDetails("Activity", activity),
        start: activityStart,
        end: activityEnd,
      }),
      drinks: addToGoogleCalendarUrl({
        title: drinksTitle,
        location: drinksLoc,
        details: mkDetails("Drinks", bar),
        start: drinksStart,
        end: drinksEnd,
      }),
    };
  })();

  const Card = ({
    label,
    item,
  }: {
    label: "Food" | "Activity" | "Bar";
    item: PlanItem;
  }) => {
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

        {/* Calendar actions */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button
            type="button"
            onClick={async () => {
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

          <a className="actionBtn" href={fullUrl} target="_blank" rel="noreferrer">
            Open in new tab
          </a>

          {calLinks && (
            <>
              <a className="actionBtn" href={calLinks.dinner} target="_blank" rel="noreferrer">
                Add Dinner to Google Calendar
              </a>
              <a className="actionBtn" href={calLinks.activity} target="_blank" rel="noreferrer">
                Add Activity to Google Calendar
              </a>
              <a className="actionBtn" href={calLinks.drinks} target="_blank" rel="noreferrer">
                Add Drinks to Google Calendar
              </a>
            </>
          )}
        </div>

        {!calLinks && (
          <div className="sub" style={{ marginTop: 10, opacity: 0.7 }}>
            Calendar links unavailable: invalid datetime in the share link.
          </div>
        )}

        <div className="sub" style={{ marginTop: 10, opacity: 0.7 }}>
          Note: If names are missing, the share link didn’t include fallback details. Re-share from
          the homepage.
        </div>
      </div>
    </div>
  );
}
