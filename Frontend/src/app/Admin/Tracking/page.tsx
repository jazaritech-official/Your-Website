"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import axios from "axios";
import { useSocket } from "@/app/utils/PusherSocketProvider";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";

// The map component is heavy (Google Maps JS API) — only load it when this page is opened.
const TrackingMap = dynamic(
  () => import("@/app/Components/TrackingMap"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] w-full animate-pulse rounded-xl bg-slate-50 sm:h-[400px]" />
    ),
  },
);
import {
  MapPin,
  Phone,
  RefreshCw,
  Loader2,
  UserRound,
  Clock,
  ExternalLink,
  Radio,
  Bike,
  X,
  BadgeCheck,
  Navigation,
  Search,
  AlertCircle,
} from "lucide-react";

const ORDER_STATUSES = [
  "Pending",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Reached Destination",
  "Delivered",
  "Cancelled",
];

const statusColor: Record<string, string> = {
  Pending: "bg-slate-100 text-slate-600",
  Processing: "bg-amber-50 text-amber-700",
  Packed: "bg-sky-50 text-sky-700",
  Shipped: "bg-blue-50 text-blue-700",
  "Out for Delivery": "bg-indigo-50 text-indigo-700",
  "Reached Destination": "bg-purple-50 text-purple-700",
  Delivered: "bg-emerald-50 text-emerald-700",
  Cancelled: "bg-red-50 text-red-600",
};

const ACTIVE_STATUSES = ["Shipped", "Out for Delivery", "Reached Destination"];

interface Rider {
  _id: string;
  username: string;
  email: string;
  phoneNo?: string;
  profilePic?: string;
}

interface ActiveOrder {
  _id: string;
  serialNumber?: number;
  trackingNumber?: string;
  status: string;
  totalPrice?: number;
  createdAt: string;
  updatedAt: string;
  trackingHistory?: Array<{ status: string; timestamp: string }>;
  riderLocation?: { lat: number; lng: number; updatedAt: string } | null;
  assignedRider?: Rider | null;
  estimatedDistanceKm?: number | null;
  estimatedEta?: string | null;
  user?: { _id: string; username: string; email: string; phoneNo?: string; profilePic?: string };
  shippingAddress?: {
    fullName: string;
    phoneNo: string;
    address: string;
    city: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  orderItems?: Array<{ product?: { name?: string; images?: Array<{ url?: string }> }; quantity?: number }>;
}

const AdminTrackingPage = () => {
  const { socket, isConnected } = useSocket();

  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [timelineOrder, setTimelineOrder] = useState<ActiveOrder | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Exact server-wide totals for the stat cards. Never derived from only the
  // loaded page of orders — refreshed by every fetch (incl. silent refetches
  // on status changes). Null until the first fetch succeeds.
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | null>(null);
  // Client-side list controls — filtering only, never a new data source.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  // Always-fresh orders for socket callbacks so they never close over stale data.
  const ordersRef = useRef<ActiveOrder[]>([]);
  ordersRef.current = orders;

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ordersRes, ridersRes] = await Promise.all([
        axios.get(`${baseUrl}tracking/active?limit=100`, { withCredentials: true }),
        axios.get(`${baseUrl}tracking/riders`, { withCredentials: true }),
      ]);
      // Backend returns { orders: [...], pagination: {...} } — extract the array.
      // Accept a bare array too so both response shapes keep working.
      const ordersList: ActiveOrder[] = Array.isArray(ordersRes.data?.data?.orders)
        ? ordersRes.data.data.orders
        : Array.isArray(ordersRes.data?.data)
          ? ordersRes.data.data
          : [];
      setOrders(ordersList);
      const counts = ordersRes.data?.data?.statusCounts;
      setStatusCounts(counts && typeof counts === "object" ? counts : null);
      setRiders(Array.isArray(ridersRes.data?.data) ? ridersRes.data.data : []);
      setLastUpdated(new Date());
      setLoadError(null);

      // Seed draft selections ONLY for newly-arrived orders so a 30s poll
      // never clobbers an admin's in-progress dropdown selection.
      const existingIds = new Set(ordersRef.current.map((o) => o._id));
      const newAssignments: Record<string, string> = {};
      const newStatusDrafts: Record<string, string> = {};
      ordersList.forEach((o: ActiveOrder) => {
        if (existingIds.has(o._id)) return;
        newAssignments[o._id] = o.assignedRider?._id || "";
        newStatusDrafts[o._id] = o.status || "Pending";
      });
      setAssignments((prev) => ({ ...prev, ...newAssignments }));
      setStatusDrafts((prev) => ({ ...prev, ...newStatusDrafts }));
    } catch (err: any) {
      const message = err?.response?.data?.message || "Failed to load deliveries";
      setLoadError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load — live order/location updates arrive via the socket
    // subscription below, which also refetches on reconnect.
    fetchData();
  }, [fetchData]);

  // Keep selected order in sync when the list refreshes
  useEffect(() => {
    if (selectedOrderId && !orders.some((o) => o._id === selectedOrderId)) {
      setSelectedOrderId(orders[0]?._id || null);
    }
    if (!selectedOrderId && orders.length > 0) {
      setSelectedOrderId(orders[0]._id);
    }
  }, [orders, selectedOrderId]);

  /* ── Real-time socket updates ── */
  useEffect(() => {
    if (!socket) return;

    const joinRooms = () => {
      ordersRef.current.forEach((o) => {
        socket.emit("tracking:join", { orderId: o._id });
        joinedRoomsRef.current.add(o._id);
      });
    };

    const onConnect = () => {
      // Vercel WebSocket Functions can cycle — rejoin every tracking room
      // and refetch the latest state (MongoDB is the source of truth).
      joinRooms();
      fetchData(true);
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
                reachedTime: data.reachedTime,
                deliveredTime: data.deliveredTime,
                updatedAt: data.updatedAt || o.updatedAt,
              }
            : o
        )
      );
      setStatusDrafts((prev) => ({
        ...prev,
        [data.orderId]: data.status || prev[data.orderId],
      }));
      // Resync silently so the exact server-side statusCounts (and any order
      // that just entered/left the active set) stay current without a manual
      // refresh. Draft selections are only seeded for new orders, so this
      // never clobbers an in-progress dropdown choice.
      fetchData(true);
    };

    /*
     * Handles both `tracking:location` (rider moved) and
     * `tracking:destination` (customer changed the delivery pin, pre-dispatch)
     * so an already-open command centre redraws the destination/route without a
     * refresh. The guard keeps the original early-return for empty payloads.
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

    const onAssignment = (data: any) => {
      if (!data?.orderId) return;
      setOrders((prev) =>
        prev.map((o) =>
          o._id === data.orderId
            ? {
                ...o,
                assignedRider: data.assignedRider || o.assignedRider,
                trackingNumber: data.trackingNumber || o.trackingNumber,
              }
            : o
        )
      );
      if (data?.orderId && data?.assignedRider?._id) {
        setAssignments((prev) => ({
          ...prev,
          [data.orderId]: data.assignedRider._id,
        }));
      }
    };

    socket.on("connect", onConnect);
    socket.on("tracking:status", onStatus);
    socket.on("tracking:location", onLocation);
    socket.on("tracking:destination", onLocation);
    socket.on("tracking:assignment", onAssignment);
    // Join rooms immediately in case the socket connected before this effect
    // ran (no "connect" event will fire for it). Initial data load happens
    // in the fetch effect above — don't double-fetch here.
    joinRooms();

    return () => {
      socket.off("connect", onConnect);
      socket.off("tracking:status", onStatus);
      socket.off("tracking:location", onLocation);
      socket.off("tracking:destination", onLocation);
      socket.off("tracking:assignment", onAssignment);
      joinedRoomsRef.current.forEach((id) => {
        socket.emit("tracking:leave", { orderId: id });
      });
      joinedRoomsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Join rooms for any new orders that appear after the socket effect ran
  useEffect(() => {
    if (!socket) return;
    orders.forEach((o) => {
      if (!joinedRoomsRef.current.has(o._id)) {
        socket.emit("tracking:join", { orderId: o._id });
        joinedRoomsRef.current.add(o._id);
      }
    });
  }, [orders, socket]);

  const assignRider = async (orderId: string) => {
    const riderId = assignments[orderId];
    if (!riderId) {
      showToast("Select a rider first", "error");
      return;
    }
    setUpdating((prev) => ({ ...prev, [orderId]: true }));
    try {
      const { data } = await axios.patch(
        `${baseUrl}tracking/${orderId}/assign-rider`,
        { riderId },
        { withCredentials: true }
      );
      setOrders((prev) =>
        prev.map((o) =>
          o._id === orderId ? { ...o, ...data.data, assignedRider: data.data.assignedRider } : o
        )
      );
      // Keep the draft in sync even if the socket is disconnected
      setAssignments((prev) => ({ ...prev, [orderId]: data.data?.assignedRider?._id || riderId }));
      showToast("Rider assigned successfully", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to assign rider", "error");
    } finally {
      setUpdating((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const updateStatus = async (orderId: string) => {
    const status = statusDrafts[orderId];
    if (!status) return;
    setUpdating((prev) => ({ ...prev, [orderId]: true }));
    try {
      const { data } = await axios.patch(
        `${baseUrl}tracking/${orderId}/status`,
        { status },
        { withCredentials: true }
      );
      setOrders((prev) =>
        prev.map((o) => (o._id === orderId ? { ...o, ...data.data } : o))
      );
      // Keep the draft in sync even if the socket is disconnected
      setStatusDrafts((prev) => ({ ...prev, [orderId]: status }));
      // Resync exact server-side counts for the stat cards (a duplicate of the
      // socket-handler refetch when connected, which is harmless).
      fetchData(true);
      showToast("Order status updated", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to update status", "error");
    } finally {
      setUpdating((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const googleMapsUrl = (order: ActiveOrder) => {
    const lat = order.shippingAddress?.latitude;
    const lng = order.shippingAddress?.longitude;
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
    const q = encodeURIComponent(
      `${order.shippingAddress?.address || ""} ${order.shippingAddress?.city || ""}`.trim()
    );
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  };

  const telHref = (phone?: string) => {
    if (!phone) return "#";
    return `tel:${phone.replace(/[^+\d]/g, "")}`;
  };

  const activeOrders = useMemo(
    () => orders.filter((o) => ACTIVE_STATUSES.includes(o.status)),
    [orders]
  );

  // Search + status filter over the already-loaded list (no extra requests).
  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeOrders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        o.user?.username,
        o.user?.email,
        o.shippingAddress?.fullName,
        o.shippingAddress?.phoneNo,
        o.shippingAddress?.city,
        o.assignedRider?.username,
        o.trackingNumber,
        o.serialNumber ? `#${o.serialNumber}` : o._id.slice(-8),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [activeOrders, search, statusFilter]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o._id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const formatTime = (d?: string | Date | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (d?: string | Date | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const hasCoords =
    selectedOrder?.shippingAddress?.latitude != null &&
    selectedOrder?.shippingAddress?.longitude != null;
  const hasRiderPos = selectedOrder?.riderLocation?.lat != null && selectedOrder?.riderLocation?.lng != null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Online Order Tracking
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Live delivery map — assign riders, update status and follow every shipment in real time
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold ${
              isConnected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            <Radio size={15} className={isConnected ? "text-emerald-500" : ""} />
            {isConnected ? "Live" : "Reconnecting"}
          </span>
          {lastUpdated && (
            <span className="text-[11px] text-slate-400">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Load error banner — the list itself keeps whatever it already has */}
      {loadError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-700">Couldn&apos;t load deliveries</p>
              <p className="text-xs font-medium text-red-600">{loadError}</p>
            </div>
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Try again
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Active Deliveries",
            // Server-wide total (falls back to the loaded list if an older
            // backend omits statusCounts).
            value: statusCounts?.total ?? activeOrders.length,
            icon: <Bike size={16} className="text-[#0856DF]" />,
            bg: "bg-blue-50",
          },
          {
            label: "Out for Delivery",
            value:
              statusCounts?.["Out for Delivery"] ??
              orders.filter((o) => o.status === "Out for Delivery").length,
            icon: <Navigation size={16} className="text-indigo-600" />,
            bg: "bg-indigo-50",
          },
          {
            label: "Reached Destination",
            value:
              statusCounts?.["Reached Destination"] ??
              orders.filter((o) => o.status === "Reached Destination").length,
            icon: <BadgeCheck size={16} className="text-purple-600" />,
            bg: "bg-purple-50",
          },
          {
            label: "Total Riders",
            value: riders.length,
            icon: <UserRound size={16} className="text-emerald-600" />,
            bg: "bg-emerald-50",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.bg}`}>
              {s.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-[11px] font-medium text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Map + list + details */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* ── Left: dedicated live map ── */}
        <div className="xl:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <MapPin size={15} className="text-[#0856DF]" />
                Live Delivery Map
              </h3>
              {selectedOrder && (
                <button
                  onClick={() => window.open(googleMapsUrl(selectedOrder), "_blank")}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0856DF] hover:underline"
                >
                  <ExternalLink size={11} /> Open in Google Maps
                </button>
              )}
            </div>

            {loading && orders.length === 0 ? (
              <div className="flex h-[320px] w-full items-center justify-center rounded-xl bg-slate-50 sm:h-[400px]">
                <Loader2 size={24} className="animate-spin text-[#C8A84E]" />
              </div>
            ) : (
              <TrackingMap
                riderPosition={hasRiderPos ? { lat: selectedOrder!.riderLocation!.lat, lng: selectedOrder!.riderLocation!.lng } : null}
                destination={hasCoords ? { lat: selectedOrder!.shippingAddress!.latitude!, lng: selectedOrder!.shippingAddress!.longitude! } : null}
                riderName={selectedOrder?.assignedRider?.username}
                destinationLabel={selectedOrder?.shippingAddress?.fullName || "Customer Location"}
                heightClass="h-[320px] w-full sm:h-[400px]"
              />
            )}

            {selectedOrder && (
              <div className="mt-3">
                <ProgressSteps status={selectedOrder.status} />
              </div>
            )}
          </div>
        </div>

        {/* ── Right: selected order details + compact list ── */}
        <div className="xl:col-span-1 flex flex-col gap-6">
          {/* Selected order details panel */}
          {selectedOrder ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {selectedOrder.user?.username ||
                      selectedOrder.shippingAddress?.fullName ||
                      "Customer"}
                  </h3>
                  <p className="font-mono text-[11px] text-slate-400">
                    #{selectedOrder.serialNumber || selectedOrder._id.slice(-8).toUpperCase()}
                    {selectedOrder.trackingNumber ? ` · ${selectedOrder.trackingNumber}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    statusColor[selectedOrder.status] || "bg-slate-100 text-slate-600"
                  }`}
                >
                  {selectedOrder.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                <Info label="Rider" value={selectedOrder.assignedRider?.username || "Not assigned"} />
                <Info
                  label="Rider Phone"
                  value={selectedOrder.assignedRider?.phoneNo || "—"}
                  href={telHref(selectedOrder.assignedRider?.phoneNo)}
                />
                <Info
                  label="Delivery Address"
                  value={`${selectedOrder.shippingAddress?.address || "—"}${
                    selectedOrder.shippingAddress?.city ? `, ${selectedOrder.shippingAddress.city}` : ""
                  }`}
                />
                <Info
                  label="Coordinates"
                  value={
                    hasCoords
                      ? `${selectedOrder.shippingAddress!.latitude!.toFixed(5)}, ${selectedOrder.shippingAddress!.longitude!.toFixed(5)}`
                      : "Not available"
                  }
                />
                <Info
                  label="Live Rider Position"
                  value={
                    hasRiderPos
                      ? `${selectedOrder.riderLocation!.lat.toFixed(5)}, ${selectedOrder.riderLocation!.lng.toFixed(5)}`
                      : "Not available"
                  }
                />
                <Info
                  label="Est. Distance"
                  value={
                    selectedOrder.estimatedDistanceKm != null
                      ? `${selectedOrder.estimatedDistanceKm.toFixed(1)} km`
                      : "—"
                  }
                />
                <Info
                  label="Est. Arrival"
                  value={selectedOrder.estimatedEta ? formatTime(selectedOrder.estimatedEta) : "—"}
                />
                <Info label="Last Update" value={formatTime(selectedOrder.riderLocation?.updatedAt)} />
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={googleMapsUrl(selectedOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0856DF] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#0645c8]"
                >
                  <ExternalLink size={13} /> Open Map
                </a>
                <a
                  href={telHref(selectedOrder.assignedRider?.phoneNo)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                    !selectedOrder.assignedRider?.phoneNo
                      ? "cursor-not-allowed border-slate-200 text-slate-300"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  <Phone size={13} /> Call Rider
                </a>
                <button
                  onClick={() => setTimelineOrder(selectedOrder)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <Clock size={13} /> View Timeline
                </button>
              </div>

              {/* Assign rider + update status */}
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Assign Rider
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={assignments[selectedOrder._id] || ""}
                      onChange={(e) =>
                        setAssignments((prev) => ({ ...prev, [selectedOrder._id]: e.target.value }))
                      }
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                    >
                      <option value="">Select rider…</option>
                      {riders.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.username}
                          {r.phoneNo ? ` (${r.phoneNo})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => assignRider(selectedOrder._id)}
                      disabled={!!updating[selectedOrder._id] || !assignments[selectedOrder._id]}
                      className="flex-shrink-0 rounded-xl bg-[#0856DF] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#0645c8] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {updating[selectedOrder._id] ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        "Assign"
                      )}
                    </button>
                  </div>
                  {riders.length === 0 && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      No riders yet. Add a rider email to RIDER_EMAILS in the backend env, or change
                      a user's role to Rider in Admin → Users.
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Update Status
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={statusDrafts[selectedOrder._id] || selectedOrder.status}
                      onChange={(e) =>
                        setStatusDrafts((prev) => ({ ...prev, [selectedOrder._id]: e.target.value }))
                      }
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => updateStatus(selectedOrder._id)}
                      disabled={!!updating[selectedOrder._id]}
                      className="flex-shrink-0 rounded-xl bg-[#222831] px-4 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:opacity-50"
                    >
                      {updating[selectedOrder._id] ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        "Update"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
              Select an order to see its details.
            </div>
          )}

          {/* Compact active delivery list */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">
              Active Deliveries
              <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                {statusCounts?.total ?? activeOrders.length}
              </span>
            </h3>

            {/* Search + status filter (client-side over the loaded list) */}
            {activeOrders.length > 0 && (
              <div className="space-y-2 border-b border-slate-100 px-3 py-3">
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search customer, rider or order #"
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs font-medium text-slate-700 outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["all", ...ACTIVE_STATUSES].map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                        statusFilter === s
                          ? "bg-[#0856DF] text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {s === "all" ? "All" : s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeOrders.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
                  <Bike size={20} className="text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No active deliveries</p>
                <p className="mt-1 text-xs text-slate-400">
                  Orders appear here once they are marked Shipped, Out for Delivery or Reached
                  Destination.
                </p>
              </div>
            ) : visibleOrders.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">
                No deliveries match your search or filter.
              </p>
            ) : (
              <div className="max-h-[560px] overflow-y-auto p-2">
                {visibleOrders.map((order) => (
                  <button
                    key={order._id}
                    onClick={() => setSelectedOrderId(order._id)}
                    className={`mb-1.5 block w-full rounded-xl border p-3 text-left transition-all ${
                      selectedOrderId === order._id
                        ? "border-[#0856DF] bg-blue-50/50 ring-2 ring-[#0856DF]/15"
                        : "border-transparent bg-slate-50/60 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {order.user?.username || order.shippingAddress?.fullName || "Customer"}
                      </p>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          statusColor[order.status] || "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span className="font-mono">
                        #{order.serialNumber || order._id.slice(-8).toUpperCase()}
                      </span>
                      <span className="truncate">Rider: {order.assignedRider?.username || "—"}</span>
                      <span>
                        {order.estimatedDistanceKm != null
                          ? `${order.estimatedDistanceKm.toFixed(1)} km`
                          : "Dist —"}
                      </span>
                      <span>
                        {order.estimatedEta ? `ETA ${formatTime(order.estimatedEta)}` : "ETA —"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline modal */}
      {timelineOrder && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setTimelineOrder(null)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Order Timeline</h3>
                <p className="text-xs text-slate-500">
                  #{timelineOrder.serialNumber || timelineOrder._id.slice(-8).toUpperCase()}
                </p>
              </div>
              <button
                onClick={() => setTimelineOrder(null)}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-0 overflow-y-auto px-6 py-5">
              {(timelineOrder.trackingHistory || []).length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No history yet.</p>
              ) : (
                (timelineOrder.trackingHistory || [])
                  .slice()
                  .reverse()
                  .map((h, idx) => (
                    <div key={idx} className="relative flex gap-4 pb-6 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span
                          className={`mt-1 h-3 w-3 rounded-full ring-4 ${
                            idx === 0 ? "bg-[#0856DF] ring-blue-100" : "bg-slate-300 ring-slate-100"
                          }`}
                        />
                        {idx < (timelineOrder.trackingHistory || []).length - 1 && (
                          <span className="w-0.5 flex-1 bg-slate-200" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{h.status}</p>
                        <p className="text-xs text-slate-400">{formatDate(h.timestamp)}</p>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Progress steps ── */
function ProgressSteps({ status }: { status: string }) {
  const steps = [
    "Pending",
    "Processing",
    "Packed",
    "Shipped",
    "Out for Delivery",
    "Reached Destination",
    "Delivered",
  ];
  const currentIdx = steps.indexOf(status);
  const progress = currentIdx < 0 ? 0 : (currentIdx / (steps.length - 1)) * 100;

  return (
    <div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#0856DF] to-[#C8A84E] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {steps.map((s, i) => (
          <span
            key={s}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              i <= currentIdx ? "bg-[#0856DF] text-white" : "bg-slate-100 text-slate-400"
            }`}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {href && href !== "#" ? (
        <a href={href} className="truncate text-sm font-semibold text-[#0856DF] hover:underline">
          {value}
        </a>
      ) : (
        <p className="truncate text-sm font-semibold text-slate-700" title={value}>
          {value}
        </p>
      )}
    </div>
  );
}

export default AdminTrackingPage;
