export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type TimeRange = [string, string]; // ["HH:MM", "HH:MM"]

export type Hours = Record<DayKey, TimeRange[]>;

export type Venue = {
  id: string;
  name: string;
  category: "Restaurant" | "Cafe" | "Dessert" | "Activity" | string;
  suburb: string; // can be full formatted address (recommended)
  website: string;
  bookingUrl: string | null;
  hours: Hours;
};
