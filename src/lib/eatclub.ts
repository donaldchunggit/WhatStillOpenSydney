/**
 * Convert a venue name into an EatClub-style slug
 */
export function eatClubSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Build a direct EatClub venue URL
 */
export function eatClubVenueUrl(name: string) {
  return `https://eatclub.com.au/venue/${eatClubSlug(name)}`;
}
