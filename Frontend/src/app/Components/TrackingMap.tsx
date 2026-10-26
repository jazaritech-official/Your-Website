"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import {
  GOOGLE_MAPS_API_KEY,
  hasGoogleMapsKey,
  ORS_API_KEY,
  hasOrsKey,
  DEFAULT_MAP_CENTER,
} from "@/app/utils/googleMaps";
import MapFallback from "./MapFallback";

/* ── Custom themed SVG marker icons ── */

const RIDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0856DF"/><stop offset="1" stop-color="#0a3fa0"/></linearGradient></defs><circle cx="18" cy="18" r="16.5" fill="rgba(8,86,223,0.35)"/><circle cx="18" cy="18" r="13.25" fill="url(#g)" stroke="#ffffff" stroke-width="2.5"/><g transform="translate(7.5 7.5)" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-3 11.5V14l-3-3 1.5-1.5L9 7.5A3.5 3.5 0 0 1 12.5 6H18l3 3.5-2.5 2.5v5.5"/></g></svg>`;

const CUSTOMER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C8A84E"/><stop offset="1" stop-color="#B8943F"/></linearGradient></defs><circle cx="16" cy="16" r="14" fill="url(#g)" stroke="#ffffff" stroke-width="2.5"/><g transform="translate(4 4)" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></g></svg>`;

const RIDER_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(RIDER_SVG)}`;
const CUSTOMER_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CUSTOMER_SVG)}`;

/* ── Themed marker with click-to-show label ── */
const IconMarker = ({
  position,
  iconUrl,
  width,
  height,
  anchorX,
  anchorY,
  label,
  zIndex,
}: {
  position: { lat: number; lng: number } | null;
  iconUrl: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  label?: string;
  zIndex?: number;
}) => {
  const map = useMap();
  const markerRef = useRef<google.maps.Marker | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const labelRef = useRef(label);
  labelRef.current = label;
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    if (!map) return;
    const marker = new google.maps.Marker({
      map,
      position: positionRef.current ?? undefined,
      icon: {
        url: iconUrl,
        scaledSize: new google.maps.Size(width, height),
        anchor: new google.maps.Point(anchorX, anchorY),
      },
      zIndex,
    });
    marker.addListener("click", () => {
      if (!labelRef.current) return;
      if (!infoRef.current) infoRef.current = new google.maps.InfoWindow();
      infoRef.current.setContent(
        `<div style="padding:4px 6px;font-size:12px;font-weight:600;color:#222831;white-space:nowrap;">${labelRef.current}</div>`
      );
      infoRef.current.open({ map, anchor: marker });
    });
    markerRef.current = marker;
    return () => {
      infoRef.current?.close();
      infoRef.current = null;
      marker.setMap(null);
      markerRef.current = null;
    };
  }, [map, iconUrl, width, height, anchorX, anchorY, zIndex]);

  useEffect(() => {
    if (markerRef.current && position) {
      markerRef.current.setPosition(position);
    }
  }, [position]);

  return null;
};

/* ── Recenter / fit bounds when props change ── */
const MapFit = ({
  points,
}: {
  points: Array<{ lat: number; lng: number } | null | undefined>;
}) => {
  const map = useMap();

  const valid = useMemo(
    () => points.filter((p): p is { lat: number; lng: number } => !!p),
    [points]
  );

  useEffect(() => {
    if (!map || valid.length === 0) return;
    if (valid.length === 1) {
      map.panTo(valid[0]);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    valid.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
  }, [map, valid]);

  return null;
};

/**
 * Draw a straight-line fallback polyline between two points.
 * Used when the ORS routing API is unavailable or fails.
 */
function drawFallbackLine(
  map: google.maps.Map,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  ref: React.MutableRefObject<google.maps.Polyline | null>,
) {
  if (ref.current) {
    ref.current.setMap(null);
    ref.current = null;
  }
  ref.current = new google.maps.Polyline({
    path: [
      new google.maps.LatLng(origin.lat, origin.lng),
      new google.maps.LatLng(destination.lat, destination.lng),
    ],
    map,
    strokeColor: "#C8A84E",
    strokeOpacity: 0.85,
    strokeWeight: 4,
    icons: [
      {
        icon: {
          path: "M 0,-1 0,1",
          strokeColor: "#C8A84E",
          strokeWeight: 4,
          scale: 2,
        },
        offset: "0",
        repeat: "16px",
      },
    ],
  });
}

/**
 * Road-following route between two points using OpenRouteService (ORS).
 * Falls back to a straight line if ORS is unavailable or fails.
 * ORS free tier: 2,000 requests/day, no credit card required.
 */
const RoutePolyline = ({
  origin,
  destination,
}: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}) => {
  const map = useMap();
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const fallbackPolylineRef = useRef<google.maps.Polyline | null>(null);
  const lastOriginRef = useRef<string>("");
  const lastDestRef = useRef<string>("");

  const originKey = `${origin.lat},${origin.lng}`;
  const destKey = `${destination.lat},${destination.lng}`;

  // Throttle: only re-request when rider has moved >100m
  const hasMovedSignificantly = useCallback(
    (prevOrigin: string, prevDest: string) => {
      if (prevDest !== destKey) return true; // destination changed
      if (prevOrigin === originKey) return false; // no movement
      const [pLat, pLng] = prevOrigin.split(",").map(Number);
      const dist = Math.sqrt(
        Math.pow((origin.lat - pLat) * 111000, 2) +
          Math.pow((origin.lng - pLng) * 111000 * Math.cos((origin.lat * Math.PI) / 180), 2)
      );
      return dist > 100; // >100 meters
    },
    [originKey, destKey, origin.lat, origin.lng]
  );

  useEffect(() => {
    if (!map) return;

    // Skip if rider hasn't moved significantly
    if (
      lastOriginRef.current &&
      lastDestRef.current &&
      !hasMovedSignificantly(lastOriginRef.current, lastDestRef.current)
    ) {
      return;
    }

    lastOriginRef.current = originKey;
    lastDestRef.current = destKey;

    // Clean up previous polylines
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }
    if (fallbackPolylineRef.current) {
      fallbackPolylineRef.current.setMap(null);
      fallbackPolylineRef.current = null;
    }

    // If no ORS key, go straight to fallback
    if (!hasOrsKey || !ORS_API_KEY) {
      drawFallbackLine(map, origin, destination, fallbackPolylineRef);
      return;
    }

    // Fetch road-following route from OpenRouteService
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        method: "POST",
        headers: {
          Authorization: ORS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // ORS expects [lng, lat] order
          coordinates: [
            [origin.lng, origin.lat],
            [destination.lng, destination.lat],
          ],
        }),
        signal: controller.signal,
      },
    )
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (!res.ok) {
          const reason = res.status === 429 ? "quota exceeded" : `HTTP ${res.status}`;
          console.warn(`[TrackingMap] ORS request failed (${reason}), falling back to straight line`);
          drawFallbackLine(map, origin, destination, fallbackPolylineRef);
          return;
        }
        const data = await res.json();
        const coords = data?.features?.[0]?.geometry?.coordinates;
        if (!coords || coords.length < 2) {
          console.warn("[TrackingMap] ORS returned no coordinates, falling back to straight line");
          drawFallbackLine(map, origin, destination, fallbackPolylineRef);
          return;
        }
        // Convert GeoJSON [lng, lat] pairs to Google LatLng objects
        const path = coords.map((c: [number, number]) => new google.maps.LatLng(c[1], c[0]));
        // Render road-following route as a gold polyline with directional arrows
        routePolylineRef.current = new google.maps.Polyline({
          path,
          map,
          strokeColor: "#C8A84E",
          strokeOpacity: 0.9,
          strokeWeight: 5,
          icons: [
            {
              icon: {
                path: google.maps.SymbolPath.FORWARD_OPEN_ARROW,
                strokeColor: "#222831",
                strokeWeight: 2,
                scale: 3,
              },
              offset: "0",
              repeat: "40px",
            },
          ],
        });
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (err.name !== "AbortError") {
          console.warn("[TrackingMap] ORS request error, falling back to straight line:", err.message);
        }
        drawFallbackLine(map, origin, destination, fallbackPolylineRef);
      });

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
      if (fallbackPolylineRef.current) {
        fallbackPolylineRef.current.setMap(null);
        fallbackPolylineRef.current = null;
      }
    };
  }, [map, origin.lat, origin.lng, destination.lat, destination.lng, originKey, destKey, hasMovedSignificantly]);

  return null;
};

interface TrackingMapProps {
  riderPosition?: { lat: number; lng: number } | null;
  destination?: { lat: number; lng: number } | null;
  riderName?: string | null;
  destinationLabel?: string;
  heightClass?: string;
  defaultCenter?: { lat: number; lng: number };
}

const TrackingMap: React.FC<TrackingMapProps> = ({
  riderPosition,
  destination,
  riderName,
  destinationLabel = "Delivery Destination",
  heightClass = "h-80 w-full",
  defaultCenter = DEFAULT_MAP_CENTER,
}) => {
  const riderLatLng: { lat: number; lng: number } | null = useMemo(
    () =>
      riderPosition?.lat != null && riderPosition?.lng != null
        ? { lat: riderPosition.lat, lng: riderPosition.lng }
        : null,
    [riderPosition]
  );

  const destLatLng: { lat: number; lng: number } | null = useMemo(
    () =>
      destination?.lat != null && destination?.lng != null
        ? { lat: destination.lat, lng: destination.lng }
        : null,
    [destination]
  );

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-line shadow-sm">
      {hasGoogleMapsKey ? (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
          <Map
            defaultCenter={defaultCenter}
            defaultZoom={11}
            className={heightClass}
            style={{ minHeight: "100%" }}
            zoomControl
            streetViewControl={false}
            mapTypeControl={false}
            fullscreenControl={false}
          >
            {/* Road-following route between rider and destination */}
            {riderLatLng && destLatLng && (
              <RoutePolyline origin={riderLatLng} destination={destLatLng} />
            )}

            {/* Customer / destination marker */}
            {destLatLng && (
              <IconMarker
                position={destLatLng}
                iconUrl={CUSTOMER_ICON_URL}
                width={32}
                height={32}
                anchorX={16}
                anchorY={16}
                label={destinationLabel}
              />
            )}

            {/* Live rider marker */}
            {riderLatLng && (
              <IconMarker
                position={riderLatLng}
                iconUrl={RIDER_ICON_URL}
                width={36}
                height={36}
                anchorX={18}
                anchorY={18}
                label={riderName ? `${riderName} — Live` : "Rider — Live"}
                zIndex={2}
              />
            )}

            <MapFit points={[destLatLng, riderLatLng]} />
          </Map>
        </APIProvider>
      ) : (
        <MapFallback className={heightClass} />
      )}
    </div>
  );
};

export default TrackingMap;
