"use client";
import { formatPKR } from "@/app/utils/format";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import {
  Package,
  Truck,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
} from "lucide-react";
import axios from "axios";
import { baseUrl, showToast, cloudinaryUrl } from "../utils/commonFunctions";
import { RootState } from "../Redux/store";
import { useSocket } from "../utils/PusherSocketProvider";

/* ── Status stepper steps (matches the Order model enum) ────────── */
const STATUS_STEPS = [
  "Pending",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Reached Destination",
  "Delivered",
];

interface ActiveOrder {
  _id: string;
  serialNumber?: number;
  status: string;
  totalPrice: number;
  createdAt: string;
  updatedAt: string;
  orderItems: Array<{
    product: {
      _id: string;
      name: string;
      images?: Array<{ url: string }>;
    };
    quantity: number;
  }>;
}

const OrderTrackingWidget = () => {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useSelector((state: RootState) => state.auth);

  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
  const [statusChanged, setStatusChanged] = useState(false);

  const prevStatusRef = useRef<string | null>(null);

  const isLoggedIn = !!auth.username && auth.isVerified;

  // Hide on checkout and on track-order / order-detail pages
  const shouldHide =
    !isLoggedIn ||
    pathname === "/checkout" ||
    pathname.startsWith("/track-order/") ||
    (pathname.startsWith("/profile/orders/") && pathname !== "/profile/orders");

  // ── Fetch active (non-Delivered, non-Cancelled) orders ─────────
  // F-005: bound the request to a sane page/limit so the response doesn't
  // grow without bound as the customer accumulates orders. 10 is generous —
  // most users never have more than 1-2 active orders simultaneously.
  const fetchActiveOrders = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const res = await axios.get(`${baseUrl}order/myOrders?page=1&limit=10`, {
        withCredentials: true,
      });
      // Backend returns { orders, pagination } when page/limit supplied,
      // plain array when not. Handle both shapes.
      const payload = res.data?.data;
      const allOrders: ActiveOrder[] =
        Array.isArray(payload) ? payload : payload?.orders ?? [];
      const active = allOrders.filter(
        (o) => o.status !== "Delivered" && o.status !== "Cancelled"
      );
      setActiveOrders(active);

      if (active.length > 0) {
        const latest = active[0];
        if (prevStatusRef.current !== null && prevStatusRef.current !== latest.status) {
          setStatusChanged(true);
          setTimeout(() => setStatusChanged(false), 2000);
        }
        prevStatusRef.current = latest.status;
      }
    } catch {
      // silently ignore — user might not be authenticated
    }
  }, [isLoggedIn]);

  // Fetch once on mount, then stay live via socket events: order status
  // changes broadcast `notification:new` to the customer's socket, and the
  // `connect` handler covers reconnects (Vercel WebSocket functions cycle).
  // No polling — the old 30s interval re-pulled the entire order list.
  const { socket, onNewNotification, offNewNotification } = useSocket();
  useEffect(() => {
    if (!isLoggedIn) {
      setActiveOrders([]);
      setIsExpanded(false);
      return;
    }

    fetchActiveOrders();
    const handleNotif = () => fetchActiveOrders();
    onNewNotification(handleNotif);
    socket?.on("connect", fetchActiveOrders);

    return () => {
      offNewNotification(handleNotif);
      socket?.off("connect", fetchActiveOrders);
    };
  }, [isLoggedIn, fetchActiveOrders, onNewNotification, offNewNotification, socket]);

  // Reset index if it goes out of bounds
  useEffect(() => {
    if (currentOrderIndex >= activeOrders.length) {
      setCurrentOrderIndex(0);
    }
  }, [activeOrders.length, currentOrderIndex]);

  if (shouldHide || activeOrders.length === 0) return null;

  const currentOrder = activeOrders[currentOrderIndex];
  if (!currentOrder) return null;

  const currentStep = STATUS_STEPS.indexOf(currentOrder.status);
  const totalActive = activeOrders.length;
  const firstItem = currentOrder.orderItems?.[0]?.product;
  const thumbUrl =
    cloudinaryUrl(firstItem?.images?.[0]?.url, 300) || "/carousel/Clothes.jpg";

  return (
    <div className="fixed bottom-4 left-4 z-50 sm:bottom-6 sm:left-6 max-w-[360px]">
      {/* ── Collapsed pill ── */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2.5 rounded-full bg-surface border border-line shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 px-4 py-2.5"
        >
          {/* Pulse ring */}
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gold/10">
            <Package size={15} className="text-brand-gold" />
            <span
              className={`absolute inset-0 rounded-full border-2 border-brand-gold ${
                statusChanged
                  ? "animate-ping opacity-75"
                  : "opacity-30"
              }`}
            />
          </span>
          <div className="flex flex-col items-start text-left leading-tight">
            <span className="text-[11px] font-bold text-brand-navy">
              Order {currentOrder.status}
            </span>
            <span className="text-[9px] text-ink-muted">
              #{currentOrder.serialNumber || currentOrder._id.slice(-8).toUpperCase()}
            </span>
          </div>
          {totalActive > 1 && (
            <span className="ml-1 rounded-full bg-brand-gold px-1.5 py-0.5 text-[8px] font-bold text-white">
              {totalActive}
            </span>
          )}
          <ChevronUp size={14} className="text-ink-subtle" />
        </button>
      )}

      {/* ── Expanded card ── */}
      {isExpanded && (
        <div className="rounded-2xl bg-surface border border-line shadow-2xl overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gold/10">
                <Truck size={13} className="text-brand-gold" />
              </div>
              <span className="text-[11px] font-bold text-brand-navy">
                Active Order
                {totalActive > 1 ? ` ${currentOrderIndex + 1} of ${totalActive}` : ""}
              </span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-muted transition-colors"
              aria-label="Collapse"
            >
              <X size={12} className="text-ink-subtle" />
            </button>
          </div>

          {/* Multi-order navigation */}
          {totalActive > 1 && (
            <div className="flex items-center justify-between px-4 py-1.5 bg-surface-muted/30 border-b border-line-soft">
              <button
                onClick={() =>
                  setCurrentOrderIndex((prev) =>
                    prev > 0 ? prev - 1 : totalActive - 1
                  )
                }
                className="flex items-center gap-1 text-[10px] font-semibold text-ink-muted hover:text-brand-gold transition-colors"
              >
                <ChevronLeft size={12} />
                Previous
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalActive }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full transition-all ${
                      i === currentOrderIndex
                        ? "bg-brand-gold w-3"
                        : "bg-surface-muted/60"
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() =>
                  setCurrentOrderIndex((prev) =>
                    prev < totalActive - 1 ? prev + 1 : 0
                  )
                }
                className="flex items-center gap-1 text-[10px] font-semibold text-ink-muted hover:text-brand-gold transition-colors"
              >
                Next
                <ChevronRight size={12} />
              </button>
            </div>
          )}

          {/* Body */}
          <div className="p-4 space-y-3">
            {/* Product thumb + order info */}
            <div className="flex items-center gap-3">
              <img
                src={thumbUrl}
                alt=""
                className="h-10 w-10 rounded-lg object-cover border border-line-soft shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-brand-navy truncate">
                  {firstItem?.name || "Order"}
                </p>
                <p className="text-[10px] text-ink-muted">
                  #{currentOrder.serialNumber || currentOrder._id.slice(-8).toUpperCase()}
                  {" · "}{formatPKR(currentOrder.totalPrice)}
                </p>
              </div>
            </div>

            {/* Compact status stepper */}
            <div className="flex items-center gap-0 py-1">
              {STATUS_STEPS.map((step, idx) => {
                const isReached = idx <= currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-0.5">
                      <div
                        className={`h-5 w-5 rounded-full flex items-center justify-center text-[7px] font-bold transition-all duration-300 ${
                          isReached
                            ? "bg-brand-gold text-white"
                            : "bg-surface-muted text-ink-subtle"
                        } ${isCurrent && statusChanged ? "animate-pulse ring-2 ring-brand-gold/30" : ""}`}
                      >
                        {idx + 1}
                      </div>
                      <span
                        className={`text-[7px] leading-tight ${
                          isReached ? "text-brand-navy font-semibold" : "text-ink-subtle"
                        }`}
                      >
                        {step === "Out for Delivery"
                          ? "Out for Del."
                          : step === "Reached Destination"
                            ? "Reached"
                            : step}
                      </span>
                    </div>
                    {idx < STATUS_STEPS.length - 1 && (
                      <div
                        className={`h-[2px] flex-1 mx-0.5 mt-[-10px] ${
                          idx < currentStep ? "bg-brand-gold" : "bg-surface-muted"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  setIsExpanded(false);
                  // Logged-in customers land on the unified order page (details +
                  // live tracking); guests use the public tracking page.
                  router.push(
                    auth.username
                      ? `/profile/orders/${currentOrder._id}`
                      : `/track-order/${currentOrder._id}`
                  );
                }}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-brand-gold py-2 text-[10px] font-bold text-white hover:bg-brand-gold-hover transition-colors"
              >
                <ExternalLink size={11} />
                View Full Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderTrackingWidget;
