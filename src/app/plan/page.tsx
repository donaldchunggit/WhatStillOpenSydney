"use client";

import { useEffect, useMemo, useState } from "react";

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

type ParsedPlan = {
  isValid: boolean;
  datetimeLabel: string | null;
  restaurant: PlanItem;
  activity: PlanItem;
  bar: PlanItem;
  fullUrl: string;
};

export default function SharedPlanPage() {
  // IMPORTANT: do not touch window during initial render (prerender-safe)
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
      if (!d) return null;
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return d;
      return dt.toLocaleString();
    })();

    const isValid = Boolean(d && r && a && b);

    const fullUrl = window.location.href;

    setPlan({
      isValid,
      datetimeLabel,
      restaurant,
      activity,
      bar,
      fullUrl,
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

  // Prerender-safe placeholder (build time will render this)
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

        <div className="sub" style={{ marginTop: 10, opacity: 0.7 }}>
          Note: If names are missing, the share link didn’t include fallback details. Re-share from the homepage.
        </div>
      </div>
    </div>
  );
}
