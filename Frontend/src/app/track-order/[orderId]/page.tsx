"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState } from "@/app/Redux/store";
import { baseUrl, cloudinaryUrl } from "@/app/utils/commonFunctions";
import OrderLiveTracking, {
  type LiveTrackingData,
} from "@/app/Components/OrderLiveTracking";
import { LogoLockup, StatusBadge, PriceSummary, SectionLabel } from "@/app/Components/ui";
import { motion, useAnimationControls } from "framer-motion";
import { EASE_STANDARD } from "@/app/utils/motion";
import {
  Clock,
  Loader2,
  Radio,
  CheckCircle2,
  HelpCircle,
  MapPin,
} from "lucide-react";

const STATUS_STEPS = [
  "Pending",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Reached Destination",
  "Delivered",
];

interface TrackingData {
  _id: string;
  serialNumber?: number;
  trackingNumber?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  cancelledBy?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  trackingHistory?: Array<{ status: string; timestamp: string; note?: string }>;
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
    fullName: string;
    phoneNo: string;
    address: string;
    city: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  orderItems?: Array<{
    quantity?: number;
    product?: { _id: string; name: string; images?: Array<{ url?: string }> };
  }>;
  itemsPrice?: number;
  shippingPrice?: number;
  discountAmount?: number;
  totalPrice?: number;
}

const TrackOrderPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const auth = useSelector((state: RootState) => state.auth);

  const [order, setOrder] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const isLoggedIn = !!auth.username && auth.isVerified;

  /*
   * Status normalization is hoisted above the loading/error early returns so
   * the motion hooks below can observe REAL status changes. The value and its
   * semantics are identical to before — `Reached` is still displayed as
   * `Reached Destination`.
   */
  const normalizedStatus =
    order?.status === "Reached" ? "Reached Destination" : order?.status ?? "";

  /*
   * MOTION ONLY — pulses the status badge when the backend reports a NEW
   * status (typically pushed through the live tracking subscription). This
   * observes `order.status`; it never writes state, and it can never imply
   * progress that has not actually been reported.
   */
  const badgeControls = useAnimationControls();
  const prevStatusRef = useRef("");
  useEffect(() => {
    if (prevStatusRef.current && prevStatusRef.current !== normalizedStatus) {
      badgeControls.start({ scale: [1, 1.08, 0.99, 1] });
    }
    prevStatusRef.current = normalizedStatus;
  }, [normalizedStatus, badgeControls]);

  useEffect(() => {
    if (!orderId) return;
    const fetchTracking = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.get(`${baseUrl}order/track/${orderId}`);
        setOrder(data?.data || null);
      } catch (err: any) {
        setError(err.response?.data?.message || "Unable to fetch order details.");
      } finally {
        setLoading(false);
      }
    };
    fetchTracking();
  }, [orderId]);

  const handleLiveStatus = React.useCallback((data: LiveTrackingData | null) => {
    if (!data) {
      setIsLive(false);
      return;
    }
    setIsLive(true);
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            trackingNumber: data.trackingNumber || prev.trackingNumber,
            status: data.status || prev.status,
            trackingHistory: data.trackingHistory || prev.trackingHistory,
            riderLocation: data.riderLocation ?? prev.riderLocation,
            estimatedDistanceKm: data.estimatedDistanceKm ?? prev.estimatedDistanceKm,
            estimatedEta: data.estimatedEta ?? prev.estimatedEta,
            assignedRider: data.assignedRider || prev.assignedRider,
            updatedAt: data.updatedAt || prev.updatedAt,
          }
        : prev
    );
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page">
        <div className="text-center">
          <Loader2 size={28} className="mx-auto animate-spin text-brand-gold" />
          <p className="mt-3 text-sm font-semibold text-ink">Loading order details…</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page p-6">
        <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 text-center shadow-card">
          <h1 className="text-xl font-bold text-ink">Order Not Found</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {error || "We couldn&apos;t find an order with this ID."}
          </p>
        </div>
      </div>
    );
  }

  const currentStep = STATUS_STEPS.findIndex(
    (step) => step.toLowerCase() === normalizedStatus.toLowerCase()
  );
  const displayStatus =
    normalizedStatus === "Reached Destination" ? "Reached" : normalizedStatus;
  const progress =
    currentStep === -1
      ? 0
      : Math.min(100, Math.round((currentStep / (STATUS_STEPS.length - 1)) * 100));

  return (
    <div className="min-h-screen bg-surface-page p-4 sm:p-8">
      {/* Continuous brand accent — the SAME proven pure-CSS technique the
          checkout page uses (background-position only, no JS, no timers, no
          React state). Fixed to the viewport top so it adds zero layout. */}
      <div
        className="ir-ambient pointer-events-none fixed inset-x-0 top-0 z-40 h-[3px]"
        aria-hidden="true"
      />
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header card */}
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          {/* Top row: logo + help */}
          <div className="mb-5 flex items-center justify-between">
            <LogoLockup compact />
            <a
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-field border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-surface-muted hover:text-ink"
            >
              <HelpCircle size={14} />
              Need Help?
            </a>
          </div>

          {/* Order identity row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-ink">
                Track #{order.serialNumber || order._id.slice(-8)}
              </h1>
              <p className="mt-1 text-xs text-ink-muted">
                {order.trackingNumber ? `Tracking: ${order.trackingNumber}` : ""}
                {order.createdAt ? ` · Ordered ${new Date(order.createdAt).toLocaleDateString()}` : ""}
              </p>
            </div>
            {/* Motion only — brief attention pulse when the real status changes. */}
            <motion.div animate={badgeControls} className="inline-flex">
              <StatusBadge status={normalizedStatus} />
            </motion.div>
          </div>

          {order.status === "Cancelled" ? (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-center">
              <p className="text-sm font-bold text-red-600">Order Cancelled</p>
              <p className="mt-0.5 text-xs text-red-500">
                {order.cancelledBy === "customer"
                  ? "Cancelled by customer"
                  : "Cancelled by the store"}
              </p>
              {order.cancelledAt && (
                <p className="mt-0.5 text-xs text-red-400">
                  {new Date(order.cancelledAt).toLocaleString()}
                </p>
              )}
              {order.cancelReason && (
                <p className="mt-1 text-xs italic text-red-500">
                  Reason: {order.cancelReason}
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div className="mt-6">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-gold to-brand-gold-hover transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-ink-muted">
                  <span>{progress}% complete</span>
                  {order.updatedAt && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> Updated {new Date(order.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>

              {/* Status steps — visual stepper */}
              <div className="mt-6 grid grid-cols-7 gap-1">
                {STATUS_STEPS.map((step, idx) => {
                  const isCompleted = idx < currentStep;
                  const isCurrent = idx === currentStep;
                  return (
                    <div key={step} className="flex flex-col items-center gap-1.5">
                      <motion.div
                        /* initial={false} — the seven dots must not animate on
                           mount; only a genuine step change moves them. */
                        initial={false}
                        animate={{ scale: isCurrent ? 1.1 : 1 }}
                        transition={{ duration: 0.25, ease: EASE_STANDARD }}
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ${
                          isCompleted
                            ? "bg-state-success text-white shadow-sm shadow-state-success/20"
                            : isCurrent
                            ? "bg-brand-gold text-brand-navy-deep shadow-sm shadow-brand-gold/20"
                            : "bg-surface-muted text-ink-subtle border border-line"
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 size={12} strokeWidth={3} /> : idx + 1}
                      </motion.div>
                      <span
                        className={`text-center text-[8px] leading-tight sm:text-[9px] ${
                          isCurrent ? "font-bold text-ink" : isCompleted ? "font-semibold text-state-success" : "text-ink-subtle"
                        }`}
                      >
                        {step === "Reached Destination" ? "Reached" : step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Live map + rider info */}
        <OrderLiveTracking orderId={order._id} onLiveStatus={handleLiveStatus} />

        {/* Two-column: Shipping Address + Timeline */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Shipping Address */}
          <div className="rounded-card border border-line bg-surface p-6 shadow-card">
            <SectionLabel>Delivery</SectionLabel>
            <h2 className="mt-1 mb-3 text-sm font-bold text-ink">
              Shipping Address
            </h2>
            <div className="space-y-1 text-sm text-ink-muted">
              {order.shippingAddress?.fullName && (
                <p className="font-semibold text-ink">{order.shippingAddress.fullName}</p>
              )}
              {order.shippingAddress?.address && (
                <p>{order.shippingAddress.address}</p>
              )}
              {order.shippingAddress?.city && (
                <p>
                  {order.shippingAddress.city}
                  {order.shippingAddress?.country ? `, ${order.shippingAddress.country}` : ""}
                </p>
              )}
            </div>
          </div>

          {/* Tracking Timeline */}
          <div className="rounded-card border border-line bg-surface p-6 shadow-card">
            <SectionLabel>Timeline</SectionLabel>
            <h2 className="mt-1 mb-4 text-sm font-bold text-ink">
              Tracking History
            </h2>
            {(order.trackingHistory || []).length === 0 ? (
              <p className="text-sm text-ink-muted">No status updates yet.</p>
            ) : (
              <div className="space-y-0">
                {(order.trackingHistory || [])
                  .slice()
                  .reverse()
                  .map((h, idx, arr) => (
                    <motion.div
                      key={idx}
                      /* Bounded stagger: only the first six entries animate, and
                         the delay is capped, so a long history can never queue a
                         mass entrance animation. */
                      initial={idx < 6 ? { opacity: 0, y: 8 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.24,
                        ease: EASE_STANDARD,
                        delay: Math.min(idx, 5) * 0.05,
                      }}
                      className="relative flex gap-4 pb-4 last:pb-0"
                    >
                      <div className="flex flex-col items-center">
                        <span
                          className={`mt-1 h-2.5 w-2.5 rounded-full ring-4 ${
                            idx === 0
                              ? "bg-brand-gold ring-brand-gold/15"
                              : "bg-ink-subtle/30 ring-surface-muted"
                          }`}
                        />
                        {idx < arr.length - 1 && <span className="w-0.5 flex-1 bg-line" />}
                      </div>
                      <div className="pb-1">
                        <p
                          className={`text-sm font-semibold ${
                            idx === 0 ? "text-ink" : "text-ink-muted"
                          }`}
                        >
                          {h.status}
                        </p>
                        {h.note && (
                          <p className="text-xs italic text-ink-subtle">{h.note}</p>
                        )}
                        <p className="text-xs text-ink-subtle">
                          {new Date(h.timestamp).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </motion.div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Order Items + Price Summary */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Order Items */}
          <div className="rounded-card border border-line bg-surface p-6 shadow-card">
            <SectionLabel>Order</SectionLabel>
            <h2 className="mt-1 mb-4 text-sm font-bold text-ink">
              Items
            </h2>
            <div className="space-y-3">
              {(order.orderItems || []).map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3">
                  {item.product?.images?.[0] ? (
                    <img
                      src={cloudinaryUrl(item.product.images[0]?.url || item.product.images[0], 100)}
                      alt={item.product.name}
                      className="h-12 w-12 rounded-lg border border-line object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-surface-muted" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {item.product?.name || "Product"}
                    </p>
                    <p className="text-xs text-ink-muted">Qty: {item.quantity}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Price Summary */}
          <div className="rounded-card border border-line bg-surface p-6 shadow-card">
            <SectionLabel>Summary</SectionLabel>
            <h2 className="mt-1 mb-4 text-sm font-bold text-ink">
              Order Summary
            </h2>
            <PriceSummary
              subtotal={order.itemsPrice || 0}
              shipping={order.shippingPrice || 0}
              discount={order.discountAmount || 0}
              total={order.totalPrice || 0}
            />
          </div>
        </div>

        {/* Live tracking prompt */}
        {!isLive && (
          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-subtle">
            <Radio size={12} />
            Log in to see live rider tracking. {isLoggedIn ? "This order isn&apos;t linked to your account." : ""}
          </p>
        )}
      </div>
    </div>
  );
};

export default TrackOrderPage;
