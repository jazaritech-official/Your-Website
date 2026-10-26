"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState } from "@/app/Redux/store";
import { useSocket } from "../utils/PusherSocketProvider";
import { baseUrl } from "@/app/utils/commonFunctions";
import dynamic from "next/dynamic";

// The map component is heavy (Google Maps JS API) — only load it when live
// tracking is actually shown (same pattern as Admin/Tracking and checkout's LocationPicker).
const TrackingMap = dynamic(() => import("@/app/Components/TrackingMap"), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-slate-100" />,
});
import {
  Clock,
  Loader2,
  MapPin,
  Phone,
  Route,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";

/* Live tracking payload shared with parent pages (status stepper / timeline). */
export interface LiveTrackingData {
  trackingNumber?: string;
  status?: string;
  trackingHistory?: Array<{ status: string; timestamp: string }>;
  riderLocation?: { lat: number; lng: number; updatedAt: string } | null;
  estimatedDistanceKm?: number | null;
  estimatedEta?: string | null;
  assignedRider?: {
    _id: string;
    username: string;
    phoneNo?: string;
    profilePic?: string;
  } | null;
  shippingAddress?: {
    // Full recipient block so a live destination change can be merged in as
    // well as the coordinates the map plots.
    fullName?: string;
    phoneNo?: string;
    address?: string;
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  locationChangedAt?: string | null;
  updatedAt?: string;
}

interface Props {
  orderId: string;
  className?: string;
  /**
   * Optional — lets the parent page keep its status stepper / timeline in
   * sync with the live data. Pass a stable callback (useCallback) so the
   * socket subscription is not torn down on every render.
   */
  onLiveStatus?: (data: LiveTrackingData | null) => void;
}

/**
 * Self-contained live delivery card (map + rider + distance + ETA + live pill).
 * Fetches the authenticated tracking payload, joins the tracking socket room
 * and subscribes to `tracking:status` / `tracking:location` events, refetching
 * after a socket reconnect so the map recovers the newest state. Renders
 * nothing when the order is not live-trackable for the current user.
 */
const OrderLiveTracking = ({ orderId, className = "", onLiveStatus }: Props) => {
  const auth = useSelector((state: RootState) => state.auth);
  const { socket, isConnected } = useSocket();

  const [data, setData] = useState<LiveTrackingData | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const joinedRef = useRef(false);

  // Keep the latest callback without forcing the socket effect to resubscribe.
  const onLiveStatusRef = useRef(onLiveStatus);
  useEffect(() => {
    onLiveStatusRef.current = onLiveStatus;
  }, [onLiveStatus]);

  const isLoggedIn = !!auth.username && auth.isVerified;

  /* ── Initial load: authenticated tracking payload only ── */
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    (async () => {
      if (!isLoggedIn) {
        if (!cancelled) {
          setLive(false);
          setLoading(false);
          onLiveStatusRef.current?.(null);
        }
        return;
      }
      setLoading(true);
      try {
        const { data: res } = await axios.get(
          `${baseUrl}tracking/order/${orderId}`,
          { withCredentials: true }
        );
        if (cancelled) return;
        const d: LiveTrackingData | null = res?.data || null;
        setData(d);
        setLive(true);
        onLiveStatusRef.current?.(d);
      } catch {
        if (cancelled) return;
        setLive(false);
        setData(null);
        onLiveStatusRef.current?.(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, isLoggedIn]);

  /* ── Refetch the latest tracking state after a socket reconnect ── */
  const refetchLatest = useCallback(async () => {
    if (!orderId || !isLoggedIn) return;
    try {
      const { data: res } = await axios.get(
        `${baseUrl}tracking/order/${orderId}`,
        { withCredentials: true }
      );
      if (res?.data) {
        setData(res.data);
        onLiveStatusRef.current?.(res.data);
      }
    } catch {
      // Keep the current state — the next live event will catch up.
    }
  }, [orderId, isLoggedIn]);

  /* ── Join tracking room + subscribe to live events (single connection) ── */
  useEffect(() => {
    if (!socket || !orderId || !live || joinedRef.current) return;
    joinedRef.current = true;

    socket.emit("tracking:join", { orderId });

    const onConnect = () => {
      socket.emit("tracking:join", { orderId });
      refetchLatest();
    };
    const onStatus = (d: any) => {
      if (d?.orderId !== orderId) return;
      setData((prev) => {
        const next: LiveTrackingData | null = prev
          ? {
              ...prev,
              status: d.status || prev.status,
              trackingHistory: d.trackingHistory || prev.trackingHistory,
              updatedAt: d.updatedAt || prev.updatedAt,
            }
          : prev;
        onLiveStatusRef.current?.(next);
        return next;
      });
    };
    /*
     * Handles BOTH live-position events:
     *   `tracking:location`    → rider moved (riderLocation)
     *   `tracking:destination` → the customer moved the delivery pin
     *     (shippingAddress). The customer's own personal channel receives the
     *     destination event, so their map re-plots without a refresh.
     * The guard preserves the previous early-return behaviour for events that
     * carry neither payload.
     */
    const onLocation = (d: any) => {
      if (d?.orderId !== orderId) return;
      if (!d.riderLocation && !d.shippingAddress) return;
      setData((prev) => {
        const next: LiveTrackingData | null = prev
          ? {
              ...prev,
              ...(d.riderLocation
                ? {
                    riderLocation: d.riderLocation,
                    estimatedDistanceKm:
                      d.estimatedDistanceKm ?? prev.estimatedDistanceKm,
                    estimatedEta: d.estimatedEta ?? prev.estimatedEta,
                  }
                : {}),
              ...(d.shippingAddress
                ? {
                    shippingAddress: d.shippingAddress,
                    locationChangedAt:
                      d.locationChangedAt ?? prev.locationChangedAt,
                    trackingHistory:
                      d.trackingHistory || prev.trackingHistory,
                  }
                : {}),
            }
          : prev;
        onLiveStatusRef.current?.(next);
        return next;
      });
    };

    socket.on("connect", onConnect);
    socket.on("tracking:status", onStatus);
    socket.on("tracking:location", onLocation);
    socket.on("tracking:destination", onLocation);

    return () => {
      socket.off("connect", onConnect);
      socket.off("tracking:status", onStatus);
      socket.off("tracking:location", onLocation);
      socket.off("tracking:destination", onLocation);
      socket.emit("tracking:leave", { orderId });
      joinedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, orderId, live, refetchLatest]);

  if (loading) return null;
  if (!live || !data) return null;

  const hasRiderPos =
    data.riderLocation?.lat != null && data.riderLocation?.lng != null;
  const hasCoords =
    data.shippingAddress?.latitude != null &&
    data.shippingAddress?.longitude != null;

  return (
    <div className={`rounded-2xl border border-line bg-surface p-6 shadow-sm ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-navy">
          <MapPin size={15} className="text-brand-gold" />
          Live Delivery Map
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold ${
            isConnected
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {isConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {isConnected ? "Live" : "Reconnecting"}
        </span>
      </div>

      <TrackingMap
        riderPosition={hasRiderPos ? data.riderLocation! : null}
        destination={
          hasCoords
            ? {
                lat: data.shippingAddress!.latitude!,
                lng: data.shippingAddress!.longitude!,
              }
            : null
        }
        riderName={data.assignedRider?.username}
        destinationLabel="Your Delivery Address"
        heightClass="h-72 w-full"
      />

      {/* Rider + ETA strip */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-[#F8F9FA] p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-navy/50">
            <UserRound size={12} /> Rider
          </p>
          <p className="mt-1 text-sm font-bold text-brand-navy">
            {data.assignedRider?.username || "Assigning rider…"}
          </p>
          {data.assignedRider?.phoneNo && (
            <a
              href={`tel:${data.assignedRider.phoneNo.replace(/[^+\d]/g, "")}`}
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-gold hover:underline"
            >
              <Phone size={11} /> {data.assignedRider.phoneNo}
            </a>
          )}
        </div>
        <div className="rounded-xl bg-[#F8F9FA] p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-navy/50">
            <Route size={12} /> Distance
          </p>
          <p className="mt-1 text-sm font-bold text-brand-navy">
            {data.estimatedDistanceKm != null
              ? `${data.estimatedDistanceKm.toFixed(1)} km`
              : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-[#F8F9FA] p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-navy/50">
            <Clock size={12} /> Estimated Arrival
          </p>
          <p className="mt-1 text-sm font-bold text-brand-navy">
            {data.estimatedEta
              ? new Date(data.estimatedEta).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </p>
        </div>
      </div>

      {!hasRiderPos && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-brand-navy/50">
          <Loader2 size={12} className="animate-spin" />
          Waiting for rider location updates…
        </p>
      )}
    </div>
  );
};

export default OrderLiveTracking;
