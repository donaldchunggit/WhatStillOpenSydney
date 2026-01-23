// src/app/plan/page.tsx
"use client";

import { useMemo } from "react";

function directionsUrl(destinationAddress: string) {
  const dest = encodeURIComponent(destinationAddress);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

function formatDatetime(d: string) {
  // d comes in like "2026-01-23T19:00"
  // Keep it simple; browser will display in local timezone
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleString();
}

type Slot = "r" | "a" | "b";

function getSlotLabel(s: Slot) {
  if (s === "r") return "Food";
  if (s === "a") return "Activity";
  return "Bar";
}

export default function PlanPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const plan = useMemo(() => {
    const d = typeof searchParams.d === "string" ? searchParams.d : "";

    const get = (k: string) => (typeof searchParams[k] === "string" ? searchParams[k] : "");

    const mk = (slot: Slot) => {
      const id = get(slot);
      const name = get(`${slot}n`);
      const suburb = get(`${slot}s`);
      const website = get(`${slot}w`);
      const eatclub = get(`${slot}e`);

      return { id, name, suburb, website, eatclub };
    };

    return {
      datetime: d,
      restaurant: mk("r"),
      activity: mk("a"),
      bar: mk("b"),
    };
  }, [searchParams]);

  const missing =
    !plan.datetime ||
    !plan.restaurant.id ||
    !plan.activity.id ||
    !plan.bar.id;

  return (
    <div className="container">
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="h1" style={{ marginBottom: 6 }}>
          Shared Night Plan
        </div>

        {plan.datetime && (
          <div className="sub" style={{ opacity: 0.8 }}>
            Time: <b>{formatDatetime(plan.datetime)}</b>
          </div>
        )}

        {missing ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Invalid or incomplete link</div>
            <div className="sub" style={{ opacity: 0.8 }}>
              This link is missing required parameters. Please re-share from the homepage.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {([
              ["r", plan.restaurant],
              ["a", plan.activity],
              ["b", plan.bar],
            ] as const).map(([slot, v]) => (
              <div
                key={slot}
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
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{getSlotLabel(slot)}</div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {v.name || "(Unnamed)"}
                  </div>
                  <div className="small" style={{ marginTop: 4 }}>
                    {v.suburb || ""}
                  </div>
                  <div className="small" style={{ marginTop: 4, opacity: 0.7 }}>
                    ID: {v.id}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {v.website && (
                    <a className="actionBtn" href={v.website} target="_blank" rel="noreferrer">
                      Website
                    </a>
                  )}

                  {v.suburb && (
                    <a className="actionBtn" href={directionsUrl(v.suburb)} target="_blank" rel="noreferrer">
                      Directions
                    </a>
                  )}

                  {v.eatclub && (
                    <a className="actionBtn" href={v.eatclub} target="_blank" rel="noreferrer">
                      EatClub
                    </a>
                  )}
                </div>
              </div>
            ))}

            <div className="sub" style={{ opacity: 0.7 }}>
              Tip: For best directions, open this on your phone so Maps routes from your current location.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
