export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type TimeRange = [string, string];
export type Hours = Record<DayKey, TimeRange[]>;

export type Venue = {
  id: string;
  name: string;
  category: "Restaurant" | "Cafe" | "Dessert" | "Activity" | string;
  suburb: string; // formatted address
  website: string;
  bookingUrl: string | null;
  hours: Hours;

  // NEW: store Google photo reference name (not a URL)
  photoName?: string | null;
};
