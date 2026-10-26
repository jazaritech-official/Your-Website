"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { MapPin, Crosshair, Search, Loader2 } from "lucide-react";
import {
  GOOGLE_MAPS_API_KEY,
  hasGoogleMapsKey,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
} from "@/app/utils/googleMaps";
import MapFallback from "./MapFallback";

// ── Types ──
interface LocationResult {
  address: string;
  lat: number;
  lng: number;
  city?: string;
}

interface LocationPickerProps {
  onLocationSelect: (loc: LocationResult) => void;
  defaultCenter?: { lat: number; lng: number };
  /**
   * Optional ALREADY-KNOWN location to show on open (e.g. an existing order's
   * saved coordinates). Seeding it only DISPLAYS the pin — it never calls
   * `onLocationSelect` on mount, so nothing is "selected" or submitted until
   * the user actually drags the pin / searches / clicks the map.
   */
  initialPosition?: { lat: number; lng: number } | null;
}

// ── Karachi default view ───────────────────────────────────────
// Most customers are in Karachi, so the map opens there at a city-level zoom.
// This only affects the DEFAULT view — search, map-pinning and the "current
// location" button still work for any location in the world.
const KARACHI_DEFAULT_CENTER = DEFAULT_MAP_CENTER;
const KARACHI_DEFAULT_ZOOM = DEFAULT_MAP_ZOOM;
// Street-level zoom used when opening on an already-known pin.
const PIN_ZOOM = 16;
// Soft-bias for the search box: Nominatim's `viewbox` (WITHOUT `bounded=1`)
// *preferences* this region while still returning results from anywhere.
const KARACHI_VIEWBOX = "66.7,25.3,67.6,24.5"; // minLon,maxLat,maxLon,minLat

// ── Nominatim rate limiter ──
let lastNominatimRequest = 0;
const NOMINATIM_MIN_INTERVAL = 1100; // ms between requests (respects 1 req/sec)

const nominatimFetch = async (url: string) => {
  const now = Date.now();
  const wait = Math.max(0, NOMINATIM_MIN_INTERVAL - (now - lastNominatimRequest));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimRequest = Date.now();
  return fetch(url, {
    headers: {
      "User-Agent": "IrhasInn/1.0 (ecommerce-app; contact@irhasinn.com)",
      Referer: typeof window !== "undefined" ? window.location.origin : "",
    },
  });
};

// ── Draggable location marker (classic google.maps.Marker so no Map ID /
//    cloud styling is required) ──
const LocationMarker = ({
  position,
  onDragEnd,
}: {
  position: { lat: number; lng: number } | null;
  onDragEnd: (lat: number, lng: number) => void;
}) => {
  const map = useMap();
  const markerRef = useRef<google.maps.Marker | null>(null);
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  // Create the marker once per map; update its position separately so we
  // never recreate it (or its listeners) on every render.
  useEffect(() => {
    if (!map) return;
    const marker = new google.maps.Marker({ map, draggable: true });
    marker.addListener("dragend", (e: google.maps.MapMouseEvent) => {
      const latLng = e.latLng;
      if (latLng) onDragEndRef.current(latLng.lat(), latLng.lng());
    });
    markerRef.current = marker;
    return () => {
      marker.setMap(null);
      markerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (markerRef.current && position) {
      markerRef.current.setPosition(position);
    }
  }, [position]);

  return null;
};

// ── Component that recenters the map ──
const MapCenterUpdater = ({ center }: { center: { lat: number; lng: number } }) => {
  const map = useMap();
  useEffect(() => {
    if (map) map.panTo(center);
  }, [map, center]);
  return null;
};

// ── Main Component ──
const LocationPicker: React.FC<LocationPickerProps> = ({
  onLocationSelect,
  defaultCenter = KARACHI_DEFAULT_CENTER,
  initialPosition = null,
}) => {
  const [center, setCenter] = useState<{ lat: number; lng: number }>(
    initialPosition || defaultCenter
  );
  const [markerPos, setMarkerPos] = useState<{ lat: number; lng: number } | null>(
    initialPosition
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    Array<{ display_name: string; lat: string; lon: string }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Reverse geocode lat/lng → address ──
  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setGeocoding(true);
      try {
        const res = await nominatimFetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
        );
        const data = await res.json();
        const address = data?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        const city =
          data?.address?.city ||
          data?.address?.town ||
          data?.address?.village ||
          data?.address?.county ||
          "";
        onLocationSelect({ address, lat, lng, city });
      } catch {
        onLocationSelect({
          address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          lat,
          lng,
        });
      } finally {
        setGeocoding(false);
      }
    },
    [onLocationSelect]
  );

  // ── Pin placed handler ──
  const handlePinPlaced = useCallback(
    (lat: number, lng: number) => {
      setMarkerPos({ lat, lng });
      setCenter({ lat, lng });
      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  // ── Handle drag end ──
  const handleDragEnd = useCallback(
    (lat: number, lng: number) => {
      handlePinPlaced(lat, lng);
    },
    [handlePinPlaced]
  );

  // ── Search Nominatim (debounced) ──
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await nominatimFetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            value
          )}&format=json&limit=5&addressdetails=1&viewbox=${KARACHI_VIEWBOX}&bounded=0`
        );
        const data = await res.json();
        setSuggestions(data || []);
        setShowSuggestions(data?.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 450);
  }, []);

  // ── Select a search suggestion ──
  const handleSelectSuggestion = (suggestion: {
    display_name: string;
    lat: string;
    lon: string;
  }) => {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);
    setSearchQuery(suggestion.display_name);
    setShowSuggestions(false);
    setMarkerPos({ lat, lng });
    setCenter({ lat, lng });
    reverseGeocode(lat, lng);
  };

  // ── Use current location ──
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setMarkerPos({ lat, lng });
        setCenter({ lat, lng });
        reverseGeocode(lat, lng);
        setGettingLocation(false);
      },
      () => {
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="space-y-3">
      {/* Search + Current Location row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-navy pointer-events-none"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Search for an address or area..."
            className="w-full rounded-2xl border border-line bg-surface px-4 py-3 pl-10 text-sm text-brand-navy placeholder:text-brand-navy/50 outline-none transition focus:border-brand-gold focus:bg-surface focus:ring-3 focus:ring-brand-gold/10"
          />
          {searching && (
            <Loader2
              size={16}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-gold animate-spin"
            />
          )}

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-[9999] mt-1 w-full rounded-2xl bg-surface border border-line shadow-xl overflow-hidden">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseDown={() => handleSelectSuggestion(s)}
                  className="w-full text-left px-4 py-3 text-sm text-brand-navy hover:bg-surface-muted transition border-b border-line last:border-b-0"
                >
                  <span className="line-clamp-2">{s.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={gettingLocation}
          className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-brand-navy transition hover:bg-surface-muted hover:border-brand-gold/30 disabled:opacity-50 shrink-0"
          title="Use my current location"
        >
          {gettingLocation ? (
            <Loader2 size={16} className="animate-spin text-brand-gold" />
          ) : (
            <Crosshair size={16} className="text-brand-gold" />
          )}
          <span className="hidden sm:inline">Current</span>
        </button>
      </div>

      {/* Map */}
      <div className="rounded-2xl overflow-hidden border border-line shadow-sm">
        {hasGoogleMapsKey ? (
          <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
            <Map
              // When an existing pin is supplied, open on it at street level
              // so the saved location is immediately visible.
              defaultCenter={initialPosition || KARACHI_DEFAULT_CENTER}
              defaultZoom={initialPosition ? PIN_ZOOM : KARACHI_DEFAULT_ZOOM}
              className="h-64 w-full"
              zoomControl
              streetViewControl={false}
              mapTypeControl={false}
              fullscreenControl={false}
              onClick={(e) => {
                const latLng = e.detail?.latLng;
                if (latLng) handlePinPlaced(latLng.lat, latLng.lng);
              }}
            >
              <LocationMarker position={markerPos} onDragEnd={handleDragEnd} />
              <MapCenterUpdater center={center} />
            </Map>
          </APIProvider>
        ) : (
          <MapFallback className="h-64 w-full" />
        )}
      </div>

      {/* Geocoding indicator */}
      {geocoding && (
        <div className="flex items-center gap-2 text-xs text-brand-gold font-semibold">
          <Loader2 size={14} className="animate-spin" />
          Getting address details...
        </div>
      )}

      {!markerPos && !geocoding && (
        <p className="text-xs text-brand-navy/60 flex items-center gap-1.5">
          <MapPin size={14} />
          Click on the map or search above to set your delivery location.
        </p>
      )}
    </div>
  );
};

export default LocationPicker;
