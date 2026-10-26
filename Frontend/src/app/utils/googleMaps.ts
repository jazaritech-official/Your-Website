/**
 * Shared Google Maps configuration.
 *
 * The Maps JavaScript API key is always read from the environment so the real
 * key is never committed. Add it to Frontend/.env.local:
 *
 *   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
 *
 * Because it is a NEXT_PUBLIC_ variable it is inlined at build time and is
 * safe to read on the client — which is required since the Maps JS API only
 * runs in the browser.
 */
export const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

/**
 * OpenRouteService API key for road-following route calculation.
 * Free tier: 2,000 requests/day, no credit card required.
 * Used by TrackingMap's RoutePolyline to replace Google Directions API.
 */
export const ORS_API_KEY =
  process.env.NEXT_PUBLIC_ORS_API_KEY || "";

export const hasOrsKey = ORS_API_KEY.length > 0;

/** True when a key is configured, so map components can render a friendly
 *  placeholder instead of trying (and failing) to load the Maps API. */
export const hasGoogleMapsKey = GOOGLE_MAPS_API_KEY.length > 0;

/** Default view for the maps — Karachi at city-level zoom (kept from the
 *  previous map implementation so the maps open in the same place). */
export const DEFAULT_MAP_CENTER: { lat: number; lng: number } = {
  lat: 24.8607,
  lng: 67.0011,
};
export const DEFAULT_MAP_ZOOM = 12;
