"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  Navigation,
  Loader2,
  MapPin,
  CheckCircle2,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  Info,
  MessageCircle,
} from "lucide-react";
import dynamic from "next/dynamic";
import DeliveryProgress from "./DeliveryProgress";
import { DeliveryProgressCompact } from "./DeliveryProgress";
import {
  deliveryCardVariants,
  sectionFadeUp,
} from "./RiderAnimations";
import { cloudinaryUrl } from "@/app/utils/commonFunctions";

const TrackingMap = dynamic(() => import("@/app/Components/TrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="h-56 w-full animate-pulse rounded-xl bg-slate-100" />
  ),
});

/* ============================================================
   ACTIVE DELIVERY CARD — Premium delivery experience
   
   Features:
   - Visual delivery progress stepper
   - Customer name + order reference
   - Compact info chips (address, items, distance)
   - Call + Navigate + Mark Delivered actions
   - Expandable map with TrackingMap
   - Premium card with subtle brand accent
   ============================================================ */

export interface RiderOrder {
  _id: string;
  serialNumber?: number;
  trackingNumber?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  trackingHistory?: Array<{ status: string; timestamp: string }>;
  riderLocation?: { lat: number; lng: number; updatedAt: string } | null;
  estimatedDistanceKm?: number | null;
  estimatedEta?: string | null;
  user?: {
    _id: string;
    username: string;
    email: string;
    phoneNo?: string;
    profilePic?: string;
  };
  shippingAddress?: {
    fullName: string;
    phoneNo: string;
    address: string;
    city: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  orderItems?: Array<{ product?: { name?: string; images?: string[] }; quantity?: number }>;
}

const statusColor: Record<string, { bg: string; text: string; dot: string }> = {
  Shipped: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  "Out for Delivery": {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
  },
  "Reached Destination": {
    bg: "bg-purple-50",
    text: "text-purple-700",
    dot: "bg-purple-500",
  },
  Delivered: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
};

const actionLabel: Record<string, string> = {
  Shipped: "Start Pickup",
  "Out for Delivery": "Picked Up — Start Delivery",
  "Reached Destination": "Mark Delivered",
};

export default function DeliveryCard({
  order,
  expanded,
  onToggle,
  updating,
  onAction,
  googleMapsUrl,
  telHref,
}: {
  order: RiderOrder;
  expanded: boolean;
  onToggle: () => void;
  updating: boolean;
  onAction: () => void;
  googleMapsUrl: string;
  telHref: string;
}) {
  const firstItem = order.orderItems?.[0];
  const sc = statusColor[order.status] || {
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
  };

  const dest =
    order.shippingAddress?.latitude != null && order.shippingAddress?.longitude != null
      ? { lat: order.shippingAddress.latitude, lng: order.shippingAddress.longitude }
      : null;

  const riderPos =
    order.riderLocation?.lat != null && order.riderLocation?.lng != null
      ? { lat: order.riderLocation.lat, lng: order.riderLocation.lng }
      : null;

  const canAct =
    order.status === "Shipped" ||
    order.status === "Out for Delivery" ||
    order.status === "Reached Destination";

  return (
    <motion.div
      variants={deliveryCardVariants}
      initial="initial"
      animate="animate"
      layout
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      {/* Brand accent bar */}
      <div
        className={`h-1 ${
          order.status === "Delivered" ? "bg-emerald-400" : "bg-[#0856DF]"
        }`}
      />

      <div className="p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Customer avatar / icon */}
            <div className="relative flex-shrink-0">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${sc.bg}`}
              >
                <PackageCheck size={20} className={sc.text} />
              </div>
              <div
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${sc.dot}`}
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">
                {order.shippingAddress?.fullName ||
                  order.user?.username ||
                  "Customer"}
              </p>
              <p className="font-mono text-[11px] text-slate-400">
                #{order.serialNumber || order._id.slice(-6).toUpperCase()}
                {order.trackingNumber ? ` · ${order.trackingNumber}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sc.bg} ${sc.text}`}
            >
              {order.status}
            </span>
            <button
              onClick={onToggle}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              aria-label={expanded ? "Collapse details" : "Expand details"}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Delivery progress */}
        {order.status !== "Delivered" && (
          <motion.div
            variants={sectionFadeUp}
            initial="hidden"
            animate="visible"
            className="mt-4"
          >
            <DeliveryProgress status={order.status} className="hidden sm:flex" />
            <DeliveryProgressCompact
              status={order.status}
              className="sm:hidden"
            />
          </motion.div>
        )}

        {/* Info chips */}
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div className="flex items-start gap-1.5 text-slate-600">
            <MapPin size={12} className="mt-0.5 flex-shrink-0 text-slate-400" />
            <span className="truncate">
              {order.shippingAddress?.address || "—"}
              {order.shippingAddress?.city
                ? `, ${order.shippingAddress.city}`
                : ""}
            </span>
          </div>
          <div className="flex items-start gap-1.5 text-slate-600">
            <PackageCheck size={12} className="mt-0.5 flex-shrink-0 text-slate-400" />
            <span className="truncate">
              {firstItem?.product?.name || "—"}
              {order.orderItems && order.orderItems.length > 1
                ? ` +${order.orderItems.length - 1} more`
                : ""}
            </span>
          </div>
          {order.estimatedDistanceKm != null && (
            <div className="flex items-start gap-1.5 text-slate-600">
              <Navigation size={12} className="mt-0.5 flex-shrink-0 text-slate-400" />
              <span>
                {order.estimatedDistanceKm.toFixed(1)} km
                {order.estimatedEta
                  ? ` · ETA ${new Date(order.estimatedEta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0856DF] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#0645c8]"
          >
            <Navigation size={13} /> Navigate
          </a>
          <a
            href={telHref}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
              telHref === "#"
                ? "cursor-not-allowed border-slate-200 text-slate-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            <Phone size={13} /> Call
          </a>
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <MessageCircle size={13} /> Details
          </button>

          {canAct && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onAction}
              disabled={updating}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {updating ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <CheckCircle2 size={13} />
              )}
              {order.status === "Shipped"
                ? "Accept Pickup"
                : order.status === "Out for Delivery"
                  ? "Confirm Pickup"
                  : "Mark Delivered"}
            </motion.button>
          )}
        </div>

        {!canAct && order.status === "Delivered" && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
            <CheckCircle2 size={12} /> Delivery completed successfully.
          </p>
        )}
      </div>

      {/* Expanded map */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="p-4">
              <TrackingMap
                riderPosition={riderPos}
                destination={dest}
                riderName={null}
                destinationLabel="Customer Location"
                heightClass="h-64 w-full rounded-xl"
              />
              {!dest && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                  <MapPin size={12} /> No coordinates — use Google Maps for navigation.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
