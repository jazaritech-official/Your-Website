"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/app/utils/PusherSocketProvider";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import {
  Radio,
  Loader2,
  MapPin,
  Info,
  Clock,
  Truck,
  CheckCircle2,
  ShoppingBag,
} from "lucide-react";

import {
  JobList,
  type MarketplaceJob,
  DeliveryCard,
  type RiderOrder,
  RiderStats,
  EmptyJobs,
  EmptyDeliveries,
  DashboardSkeleton,
  OfflineBanner,
} from "@/app/Components/rider";
import { sectionFadeUp } from "@/app/Components/rider/RiderAnimations";

/* ============================================================
   RIDER DASHBOARD 2.0 — Irhas'Inn Delivery Hub
   
   Premium, modular, mobile-first rider dashboard.
   Uses extracted components for maintainability.
   All business logic is preserved exactly.
   ============================================================ */

const LOCATION_INTERVAL_MS = 20000;

// ── New Job Sound (preserved exactly) ──
let _jobAudioCtx: AudioContext | null = null;

function armJobAudioOnFirstInteraction() {
  if (typeof window === "undefined") return;
  const unlock = () => {
    try {
      if (!_jobAudioCtx) _jobAudioCtx = new AudioContext();
      _jobAudioCtx.resume().catch(() => {});
    } catch {
      /* AudioContext unavailable */
    }
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

async function playNewJobSound() {
  try {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!_jobAudioCtx) _jobAudioCtx = new AudioContext();
    const ctx = _jobAudioCtx;

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return;
      }
      const stateAfterResume: string = ctx.state;
      if (stateAfterResume !== "running") return;
    }

    const now = ctx.currentTime;
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = "sine";
    o1.frequency.setValueAtTime(1047, now);
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.18, now + 0.015);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o1.connect(g1);
    g1.connect(ctx.destination);
    o1.start(now);
    o1.stop(now + 0.12);

    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = "sine";
    o2.frequency.setValueAtTime(1319, now + 0.08);
    g2.gain.setValueAtTime(0, now + 0.08);
    g2.gain.linearRampToValueAtTime(0.15, now + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.start(now + 0.08);
    o2.stop(now + 0.22);
  } catch {
    /* non-critical */
  }
}

// ── Status mapping ──
type TabKey = "marketplace" | "pending" | "outForDelivery" | "reached" | "delivered";

const RiderDashboardPage = () => {
  const { socket, isConnected } = useSocket();

  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("marketplace");

  // ── Marketplace state ──
  const [marketplaceJobs, setMarketplaceJobs] = useState<MarketplaceJob[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [newJobIds, setNewJobIds] = useState<Set<string>>(new Set());

  // ── Location state ──
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "requesting" | "active" | "denied" | "error"
  >("idle");
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const sentForOrdersRef = useRef<Set<string>>(new Set());
  const ordersRef = useRef<RiderOrder[]>([]);
  ordersRef.current = orders;

  // Clear new-job IDs after animation plays
  useEffect(() => {
    if (newJobIds.size === 0) return;
    const timer = setTimeout(() => setNewJobIds(new Set()), 3000);
    return () => clearTimeout(timer);
  }, [newJobIds]);

  useEffect(() => {
    armJobAudioOnFirstInteraction();
  }, []);

  // ── Data fetching ──
  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${baseUrl}tracking/rider/orders`, {
        withCredentials: true,
      });
      const data = res.data?.data || {};
      const combined = [
        ...(data.pending || []),
        ...(data.outForDelivery || []),
        ...(data.reached || []),
        ...(data.delivered || []),
      ];
      setOrders(combined);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to load deliveries", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMarketplace = useCallback(async () => {
    try {
      const res = await axios.get(`${baseUrl}tracking/marketplace`, {
        withCredentials: true,
      });
      setMarketplaceJobs(res.data?.data || []);
    } catch {
      /* Marketplace may not be available */
    } finally {
      setMarketplaceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchMarketplace();
  }, [fetchOrders, fetchMarketplace]);

  // ── Accept job ──
  const acceptJob = async (orderId: string) => {
    setAcceptingId(orderId);
    try {
      await axios.patch(`${baseUrl}tracking/marketplace/${orderId}/accept`, {}, {
        withCredentials: true,
      });
      showToast("Order accepted! Check your Pending Deliveries.", "success");
      setMarketplaceJobs((prev) => prev.filter((j) => j._id !== orderId));
      setNewJobIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      fetchOrders();
      setActiveTab("pending");
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to accept job";
      showToast(msg, "error");
      if (err?.response?.status === 409) {
        setMarketplaceJobs((prev) => prev.filter((j) => j._id !== orderId));
      }
    } finally {
      setAcceptingId(null);
    }
  };

  // ── Socket: live updates ──
  useEffect(() => {
    if (!socket) return;

    const joinRooms = () => {
      ordersRef.current.forEach((o) =>
        socket.emit("tracking:join", { orderId: o._id })
      );
    };

    const onConnect = () => {
      joinRooms();
      fetchOrders();
      fetchMarketplace();
    };

    const onStatus = (data: any) => {
      if (!data?.orderId) return;
      setOrders((prev) =>
        prev.map((o) =>
          o._id === data.orderId
            ? {
                ...o,
                status: data.status || o.status,
                trackingHistory: data.trackingHistory || o.trackingHistory,
                updatedAt: data.updatedAt || o.updatedAt,
              }
            : o
        )
      );
    };

    /*
     * Handles both `tracking:location` (this rider's own position feed) and
     * `tracking:destination` (customer changed the drop-off, pre-dispatch) so
     * the rider's route never shows a stale address. The guard keeps the
     * original early-return behaviour for empty payloads.
     */
    const onLocation = (data: any) => {
      if (!data?.orderId) return;
      if (!data.riderLocation && !data.shippingAddress) return;
      setOrders((prev) =>
        prev.map((o) =>
          o._id === data.orderId
            ? {
                ...o,
                ...(data.riderLocation
                  ? {
                      riderLocation: data.riderLocation,
                      estimatedDistanceKm: data.estimatedDistanceKm ?? o.estimatedDistanceKm,
                      estimatedEta: data.estimatedEta ?? o.estimatedEta,
                    }
                  : {}),
                ...(data.shippingAddress
                  ? { shippingAddress: data.shippingAddress }
                  : {}),
              }
            : o
        )
      );
    };

    const onNewJob = (data: any) => {
      if (!data?._id) return;
      setMarketplaceJobs((prev) => {
        if (prev.some((j) => j._id === data._id)) return prev;
        playNewJobSound();
        return [data, ...prev];
      });
      setNewJobIds((prev) => new Set(prev).add(data._id));
    };

    socket.on("connect", onConnect);
    socket.on("tracking:status", onStatus);
    socket.on("tracking:location", onLocation);
    socket.on("tracking:destination", onLocation);
    socket.on("marketplace:new_job", onNewJob);
    joinRooms();

    return () => {
      socket.off("connect", onConnect);
      socket.off("tracking:status", onStatus);
      socket.off("tracking:location", onLocation);
      socket.off("tracking:destination", onLocation);
      socket.off("marketplace:new_job", onNewJob);
      ordersRef.current.forEach((o) =>
        socket.emit("tracking:leave", { orderId: o._id })
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    orders.forEach((o) => {
      if (o.status !== "Delivered") {
        socket.emit("tracking:join", { orderId: o._id });
      }
    });
  }, [orders, socket]);

  // ── GPS Location ──
  const sendLocation = useCallback(async (coords: { lat: number; lng: number }) => {
    const active = ordersRef.current.filter((o) => o.status !== "Delivered");
    if (active.length === 0) return;
    await Promise.allSettled(
      active.map((order) =>
        axios.patch(
          `${baseUrl}tracking/${order._id}/location`,
          { lat: coords.lat, lng: coords.lng },
          { withCredentials: true }
        )
      )
    );
  }, []);

  const startLocationStream = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("error");
      showToast("Geolocation is not supported on this device", "error");
      return;
    }

    setLocationStatus("requesting");

    const success = (pos: GeolocationPosition) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      coordsRef.current = coords;
      setCurrentCoords(coords);
      setLocationStatus("active");
      setLastSentAt(new Date());
      sendLocation(coords);
    };

    const error = (err: GeolocationPositionError) => {
      setLocationStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      if (err.code === err.PERMISSION_DENIED) {
        showToast("Location permission denied. Enable it to share your live position.", "error");
      }
    };

    navigator.geolocation.getCurrentPosition(success, error, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        coordsRef.current = coords;
        setCurrentCoords(coords);
      },
      error,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );

    intervalRef.current = setInterval(() => {
      const c = coordsRef.current;
      if (c) {
        setLastSentAt(new Date());
        sendLocation(c);
      }
    }, LOCATION_INTERVAL_MS);
  }, [sendLocation]);

  const stopLocationStream = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    watchIdRef.current = null;
    intervalRef.current = null;
    setLocationStatus("idle");
  }, []);

  useEffect(() => {
    const active = orders.filter((o) => o.status !== "Delivered");
    active.forEach((o) => {
      if (!sentForOrdersRef.current.has(o._id) && coordsRef.current) {
        sentForOrdersRef.current.add(o._id);
        axios
          .patch(
            `${baseUrl}tracking/${o._id}/location`,
            { lat: coordsRef.current.lat, lng: coordsRef.current.lng },
            { withCredentials: true }
          )
          .catch(() => {});
      }
    });
  }, [orders]);

  useEffect(() => () => stopLocationStream(), [stopLocationStream]);

  // ── Actions ──
  const markDelivered = async (orderId: string) => {
    setUpdating(orderId);
    try {
      await axios.patch(
        `${baseUrl}tracking/${orderId}/status`,
        { status: "Delivered" },
        { withCredentials: true }
      );
      showToast("Order delivered — customer has been notified", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to update", "error");
    } finally {
      setUpdating(null);
    }
  };

  const advanceStatus = async (orderId: string, currentStatus: string) => {
    const nextStatus =
      currentStatus === "Shipped"
        ? "Out for Delivery"
        : currentStatus === "Out for Delivery"
          ? "Delivered"
          : "Delivered";
    setUpdating(orderId);
    try {
      await axios.patch(
        `${baseUrl}tracking/${orderId}/status`,
        { status: nextStatus },
        { withCredentials: true }
      );
      showToast(`Status updated to "${nextStatus}"`, "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to update", "error");
    } finally {
      setUpdating(null);
    }
  };

  const googleMapsUrl = (order: RiderOrder) => {
    const lat = order.shippingAddress?.latitude;
    const lng = order.shippingAddress?.longitude;
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    }
    const q = encodeURIComponent(
      `${order.shippingAddress?.address || ""} ${order.shippingAddress?.city || ""}`.trim()
    );
    return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  };

  const telHref = (phone?: string) => {
    if (!phone) return "#";
    return `tel:${phone.replace(/[^+\d]/g, "")}`;
  };

  // ── Derived data ──
  const pending = useMemo(
    () =>
      orders
        .filter((o) => o.status === "Shipped")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [orders]
  );
  const outForDelivery = useMemo(() => orders.filter((o) => o.status === "Out for Delivery"), [orders]);
  const reached = useMemo(() => orders.filter((o) => o.status === "Reached Destination"), [orders]);
  const delivered = useMemo(() => orders.filter((o) => o.status === "Delivered"), [orders]);
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== "Delivered"), [orders]);

  const currentList =
    activeTab === "marketplace"
      ? []
      : activeTab === "pending"
        ? pending
        : activeTab === "outForDelivery"
          ? outForDelivery
          : activeTab === "reached"
            ? reached
            : delivered;

  // ── Stats config ──
  const statsConfig = [
    { key: "marketplace", label: "Available", count: marketplaceJobs.length, icon: ShoppingBag, color: "bg-blue-50 text-blue-500", iconColor: "text-blue-500", activeColor: "bg-[#0856DF]" },
    { key: "pending", label: "Pending", count: pending.length, icon: Clock, color: "bg-amber-50 text-amber-500", iconColor: "text-amber-500", activeColor: "bg-amber-500" },
    { key: "outForDelivery", label: "Active", count: outForDelivery.length, icon: Truck, color: "bg-indigo-50 text-indigo-500", iconColor: "text-indigo-500", activeColor: "bg-indigo-500" },
    { key: "reached", label: "Arrived", count: reached.length, icon: MapPin, color: "bg-purple-50 text-purple-500", iconColor: "text-purple-500", activeColor: "bg-purple-500" },
    { key: "delivered", label: "Done", count: delivered.length, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-500", iconColor: "text-emerald-500", activeColor: "bg-emerald-500" },
  ];

  // ── Loading state ──
  if (loading && orders.length === 0) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-5">
      {/* ── Header + Status ── */}
      <motion.div
        variants={sectionFadeUp}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Rider Hub
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Date().toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Connection indicator */}
          <motion.div
            animate={isConnected ? "connected" : "disconnected"}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
              isConnected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            <span
              className={`relative flex h-2 w-2 ${
                isConnected ? "text-emerald-500" : "text-amber-500"
              }`}
            >
              {isConnected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  isConnected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
            </span>
            {isConnected ? "Live" : "Reconnecting"}
          </motion.div>

          {/* Location toggle */}
          {locationStatus === "active" ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              <span className="hidden sm:inline">GPS Active</span>
              <span className="sm:hidden">GPS</span>
              {lastSentAt && (
                <span className="text-[10px] font-medium text-blue-500">
                  {lastSentAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button
                onClick={stopLocationStream}
                className="ml-1 text-[10px] font-bold text-blue-600 underline-offset-2 hover:underline"
              >
                Stop
              </button>
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={startLocationStream}
              disabled={locationStatus === "requesting"}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0856DF] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#0645c8] disabled:opacity-60"
            >
              {locationStatus === "requesting" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Radio size={14} />
              )}
              {locationStatus === "requesting"
                ? "Requesting…"
                : locationStatus === "denied"
                  ? "Enable GPS"
                  : "Enable GPS"}
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* Offline banner */}
      <AnimatePresence>
        {!isConnected && <OfflineBanner />}
      </AnimatePresence>

      {/* GPS info */}
      <AnimatePresence>
        {locationStatus === "active" && currentCoords && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-800">
              <MapPin size={13} className="text-[#0856DF]" />
              <span className="font-semibold">Position shared</span>
              <span className="font-mono text-blue-600">
                {currentCoords.lat.toFixed(5)}, {currentCoords.lng.toFixed(5)}
              </span>
              <span className="text-blue-500">
                · {activeOrders.length} active order{activeOrders.length !== 1 ? "s" : ""}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {locationStatus === "denied" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Location permission was denied. Enable it in your browser settings so the admin and
          customers can see your live position.
        </div>
      )}

      {/* Auto-reached info */}
      <div className="flex items-start gap-2.5 rounded-xl border border-[#C8A84E]/20 bg-[#C8A84E]/5 px-4 py-3 text-xs text-[#222831]">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-[#C8A84E]" />
        <p>
          <span className="font-semibold">Auto-reached</span> — the system verifies your GPS
          and updates status when you arrive at the customer location.
        </p>
      </div>

      {/* ── Stats ── */}
      <RiderStats
        stats={statsConfig}
        activeTab={activeTab}
        onSelectTab={(key) => setActiveTab(key as TabKey)}
      />

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        {activeTab === "marketplace" ? (
          <motion.div
            key="marketplace"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {marketplaceLoading ? (
              <DashboardSkeleton />
            ) : marketplaceJobs.length === 0 ? (
              <EmptyJobs />
            ) : (
              <JobList
                jobs={marketplaceJobs}
                acceptingId={acceptingId}
                onAccept={acceptJob}
                newJobIds={newJobIds}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {currentList.length === 0 ? (
              <EmptyDeliveries tab={activeTab} />
            ) : (
              <div className="space-y-3">
                {currentList.map((order) => (
                  <DeliveryCard
                    key={order._id}
                    order={order}
                    expanded={expandedId === order._id}
                    onToggle={() =>
                      setExpandedId(expandedId === order._id ? null : order._id)
                    }
                    updating={updating === order._id}
                    onAction={() =>
                      order.status === "Delivered"
                        ? undefined
                        : order.status === "Reached Destination"
                          ? markDelivered(order._id)
                          : advanceStatus(order._id, order.status)
                    }
                    googleMapsUrl={googleMapsUrl(order)}
                    telHref={telHref(order.shippingAddress?.phoneNo)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RiderDashboardPage;
