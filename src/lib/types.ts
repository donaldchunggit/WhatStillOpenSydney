export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type TimeRange = [string, string];
export type Hours = Record<DayKey, TimeRange[]>;

/**
 * Keep categories STRICT so they stay consistent everywhere
 */
export type Category =
  | "Restaurant"
  | "Cafe"
  | "Dessert"
  | "Activity"
  | "Bar";

export type Venue = {
  id: string;
  name: string;
  category: Category;
  suburb: string;
  website: string;
  bookingUrl: string | null;
  hours: Hours;

  // used for Google Places photos
  photoName?: string | null;

  // EatClub enrichment
  onEatClub?: boolean;
  eatClubUrl?: string | null;
};
