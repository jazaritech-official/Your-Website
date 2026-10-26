"use client";
import { formatPKR } from "@/app/utils/format";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/app/Redux/store";
import { startLoading, stopLoading } from "@/app/Redux/Features/uiSlice";
import {
  ArrowLeft,
  Package,
  MapPin,
  CreditCard,
  CheckCircle,
  Clock,
  Star,
  FileText,
  ExternalLink,
  Gift,
  Wallet,
  MessageCircle,
} from "lucide-react";
import { baseUrl, showToast, cloudinaryUrl } from "@/app/utils/commonFunctions";
import { DEFAULT_REWARD_PERCENTAGE } from "@/app/utils/referral";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  StatusBadge,
  buttonStyles,
} from "@/app/Components/ui";
import OrderLiveTracking, {
  type LiveTrackingData,
} from "@/app/Components/OrderLiveTracking";
import ChangeLocationModal from "@/app/Components/order/ChangeLocationModal";

const RatingForm = ({ productId, productName }: { productId: string; productName: string }) => {
  const [star, setStar] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!star) return showToast("Please select a star rating", "error");
    setLoading(true);
    try {
      await axios.put(`${baseUrl}product/productRatings/${productId}`, { star, comment }, { withCredentials: true });
      showToast("Rating submitted!", "success");
      setSubmitted(true);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to submit rating", "error");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) return (
    <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-state-success">
      <CheckCircle size={14} aria-hidden /> Rating submitted for {productName}
    </p>
  );

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p id={`rate-${productId}`} className="mb-2 text-xs font-bold text-brand-navy">
        Rate this product
      </p>
      {/* Icon-only stars need an accessible name and a pressed state. */}
      <div
        role="radiogroup"
        aria-labelledby={`rate-${productId}`}
        className="mb-2 flex gap-1"
      >
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={star === s}
            aria-label={`${s} star${s === 1 ? "" : "s"}`}
            onClick={() => setStar(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            className="flex h-11 w-11 items-center justify-center rounded-field transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
          >
            <Star
              size={22}
              aria-hidden
              className={`transition-colors ${
                s <= (hover || star) ? "fill-brand-gold text-brand-gold" : "text-ink-subtle"
              }`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Write a comment (optional)"
        rows={2}
        aria-label="Rating comment"
        className="mb-2 w-full resize-none rounded-field border border-line bg-surface px-3 py-2 text-sm text-brand-navy outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-brand-gold focus:ring-4 focus:ring-brand-gold/15"
      />
      <Button
        variant="gold"
        size="sm"
        loading={loading}
        onClick={handleSubmit}
      >
        {loading ? "Submitting..." : "Submit Rating"}
      </Button>
    </div>
  );
};

const STATUS_STEPS = [
  "Pending",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Reached Destination",
  "Delivered",
];

/* The previous statusColor map gave every status the SAME white/navy pill, so
   the badge carried no information. The shared StatusBadge owns that mapping
   now (the orders LIST already uses it), which keeps both surfaces identical. */

/*
Statuses in which a customer may still change their delivery location.
Mirrors `roleHelpers.canChangeDeliveryLocation` on the backend (which remains
the authority — this only drives whether the button is enabled).
*/
const LOCATION_CHANGEABLE_STATUSES = ["Pending", "Processing", "Packed"];

const OrderTrackingPage = () => {
  const { orderId } = useParams();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Open the existing chat with this order attached as conversation context.
  const handleChatAboutOrder = () => {
    if (!orderId) return;
    router.push(`/chat?order=${orderId}`);
  };

  // Keep the status stepper + timeline in sync with live rider/status events.
  const handleLiveStatus = useCallback((data: LiveTrackingData | null) => {
    if (!data) return;
    setOrder((prev: any) =>
      prev
        ? {
            ...prev,
            status: data.status || prev.status,
            trackingHistory: data.trackingHistory || prev.trackingHistory,
            assignedRider: data.assignedRider || prev.assignedRider,
            riderLocation: data.riderLocation ?? prev.riderLocation,
            estimatedDistanceKm: data.estimatedDistanceKm ?? prev.estimatedDistanceKm,
            estimatedEta: data.estimatedEta ?? prev.estimatedEta,
            // A live destination change (tracking:destination) keeps the
            // address card in sync even when the change was made elsewhere.
            shippingAddress: data.shippingAddress || prev.shippingAddress,
            locationChangedAt: data.locationChangedAt ?? prev.locationChangedAt,
            updatedAt: data.updatedAt || prev.updatedAt,
          }
        : prev
    );
  }, []);

  /* Silent re-sync used when a location change is rejected server-side because
     the order left the changeable window while the modal was open. Deliberately
     does NOT toggle the page-level loader — the existing view stays put. */
  const refreshOrder = useCallback(async () => {
    if (!orderId || !auth.username) return;
    try {
      const res = await axios.get(`${baseUrl}order/getOrder/${orderId}`, {
        withCredentials: true,
      });
      setOrder(res.data.data);
    } catch {
      // Keep the current view — the error toast already explained the failure.
    }
  }, [orderId, auth.username]);

  const handleCancelOrder = async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    try {
      const res = await axios.post(
        `${baseUrl}order/cancel/${orderId}`,
        { cancelReason: cancelReason.trim() || undefined },
        { withCredentials: true }
      );
      // Replace local state with the server response so the page reflects
      // the Cancelled status, reason, time and tracking history instantly.
      setOrder(res.data.data);
      setShowCancelModal(false);
      setCancelReason("");
      showToast("Order cancelled successfully", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to cancel order", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDownloadInvoice = async () => {
    setDownloadingInvoice(true);
    try {
      const res = await axios.get(`${baseUrl}order/${orderId}/invoice`, {
        withCredentials: true,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      const serialStr = order?.serialNumber || orderId?.toString().slice(-8);
      link.download = `invoice-${serialStr}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast("Invoice downloaded", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to download invoice", "error");
    } finally {
      setDownloadingInvoice(false);
    }
  };

  useEffect(() => {
    if (!orderId || !auth.username) return;
    const fetchOrder = async () => {
      dispatch(startLoading("ZF Loading Order Details"));
      setLoading(true);
      try {
        const res = await axios.get(`${baseUrl}order/getOrder/${orderId}`, { withCredentials: true });
        setOrder(res.data.data);
      } catch (err: any) {
        showToast(err?.response?.data?.message || "Failed to load order", "error");
      } finally {
        setLoading(false);
        dispatch(stopLoading());
      }
    };
    fetchOrder();
  }, [orderId, auth.username]);

  // Route guard: same inline fallback used by the profile / wishlist pages.
  // Placed before the loading check so unauthenticated users never see the
  // perpetual "Loading order details..." spinner (the fetch bails on no user).
  if (!auth.username) {
    return (
      <main className="min-h-screen bg-surface-page px-4 pb-16 pt-8">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={<Package size={26} />}
            title="Sign in to view this order"
            description="Order details and live delivery tracking are only available to the account that placed the order."
            action={
              <Link href="/" className={buttonStyles({ variant: "gold", size: "md" })}>
                <ArrowLeft size={16} /> Back to Home
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  if (loading) {
    /* Skeleton mirrors the real layout so the page does not jump from a
       centred line of text into a full order view. */
    return (
      <div className="min-h-screen bg-surface-page px-4 pb-16 pt-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 h-4 w-32 animate-pulse rounded bg-surface-muted" />
          <div className="rounded-card border border-line bg-surface p-6 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <div className="h-7 w-40 animate-pulse rounded bg-surface-muted" />
              <div className="h-7 w-24 animate-pulse rounded-full bg-surface-muted" />
            </div>
            <div className="mt-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-muted" />
                  <div className="h-3 w-40 animate-pulse rounded bg-surface-muted" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 h-48 animate-pulse rounded-card border border-line bg-surface shadow-card" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-surface-page px-4 pb-16 pt-8">
        <div className="mx-auto max-w-3xl">
          <ErrorState
            title="We couldn't load this order"
            message="The order may have been removed, or the link is no longer valid. Your order history is still available."
            retryLabel="Back to my orders"
            onRetry={() => router.push("/profile/orders")}
          />
        </div>
      </div>
    );
  }

  const currentStepIndex = STATUS_STEPS.indexOf(order.status);
  const isCancelled = order.status === "Cancelled";
  const currentHistoryEntry = [...(order.trackingHistory || [])]
    .reverse()
    .find((h: any) => h.status === order.status);

  // Customers may cancel only while the order is still "Pending" (before any
  // processing begins). The button disappears for every later status.
  const canCancel = order.status === "Pending";

  // Delivery-location editing: pre-dispatch AND no rider assigned. The server
  // re-validates both signals on save, so this is purely the UX mirror.
  const canChangeLocation =
    LOCATION_CHANGEABLE_STATUSES.includes(order.status) && !order.assignedRider;
  const changeLocationBlockReason = order.assignedRider
    ? "A rider is already assigned to this order, so the delivery location can no longer be changed."
    : `The delivery location can no longer be changed — this order is already "${order.status}".`;
  // Keep the entry visible-but-disabled while the order is still in flight, so
  // the option does not silently vanish. Only finished/cancelled orders hide it.
  const showChangeLocation = !["Delivered", "Cancelled"].includes(order.status);

  // Referral information only when this order is actually referral-related.
  const hasReferralInfo =
    Boolean(order.referralCode) || Number(order.walletRedemptionAmount || 0) > 0;

  return (
    <div className="min-h-screen bg-surface-page px-4 pb-16 pt-8">
      {/* Single group entrance for the whole order view — one animated
          surface instead of dozens, so the timeline/map stay composited. */}
      <div className="mx-auto max-w-3xl ir-fade-in-up">
        <Link
          href="/profile/orders"
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-brand-gold-hover"
        >
          <ArrowLeft size={16} /> Back to Orders
        </Link>

        <div className="mb-6 overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="border-b border-line p-5 sm:p-6">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-brand-navy">
                  Order Details
                </h1>
                <p className="mt-1 truncate font-mono text-xs text-ink-subtle">
                  {order._id}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={order.status || "pending"} />
                {order.serialNumber && (
                  <Badge tone="neutral" size="sm">
                    #{order.serialNumber}
                  </Badge>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canCancel && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowCancelModal(true)}
                >
                  Cancel Order
                </Button>
              )}
              {showChangeLocation && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<MapPin size={14} aria-hidden />}
                  disabled={!canChangeLocation}
                  title={
                    canChangeLocation ? undefined : changeLocationBlockReason
                  }
                  onClick={() => canChangeLocation && setShowLocationModal(true)}
                >
                  Change Location
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                icon={<MessageCircle size={14} aria-hidden />}
                onClick={handleChatAboutOrder}
              >
                Chat About This Order
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={downloadingInvoice}
                icon={<FileText size={14} aria-hidden />}
                onClick={handleDownloadInvoice}
              >
                {downloadingInvoice ? "Preparing…" : "Invoice"}
              </Button>
            </div>
          </div>

          {/* Tracking Stepper */}
          <div className="p-6">
            {isCancelled ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-state-danger/10 text-state-danger">
                  <Package size={28} aria-hidden />
                </div>
                <p className="text-lg font-bold text-brand-navy">Order Cancelled</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {order.cancelledBy === "customer"
                    ? "This order was cancelled by you."
                    : "This order has been cancelled."}
                </p>
                {order.cancelledAt && (
                  <p className="mt-1 text-xs text-ink-subtle">
                    Cancelled on {new Date(order.cancelledAt).toLocaleString()}
                  </p>
                )}
                {order.cancelReason && (
                  <p className="mt-2 text-xs italic text-ink-muted">
                    Reason: {order.cancelReason}
                  </p>
                )}
              </div>
            ) : (
              /* The pending connector rail and pending dots used to be
                 `bg-[#FFFFFF]` / `bg-white` ON a white card, so the timeline
                 rendered without any visible rail or upcoming markers. */
              <ol className="relative">
                {STATUS_STEPS.map((step, idx) => {
                  const isCompleted = idx <= currentStepIndex;
                  const isCurrent = idx === currentStepIndex;
                  const isLast = idx === STATUS_STEPS.length - 1;
                  return (
                    <li key={step} className="flex items-start">
                      <div className="mr-4 flex flex-col items-center">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                            isCompleted
                              ? "border-brand-gold bg-brand-gold text-white"
                              : "border-line bg-surface text-ink-subtle"
                          } ${isCurrent ? "ring-4 ring-brand-gold/20" : ""}`}
                        >
                          {isCompleted ? (
                            <CheckCircle size={16} aria-hidden />
                          ) : (
                            idx + 1
                          )}
                        </div>
                        {!isLast && (
                          <div
                            aria-hidden
                            className={`h-10 w-0.5 ${isCompleted ? "bg-brand-gold" : "bg-line"}`}
                          />
                        )}
                      </div>
                      <div className={isLast ? "pb-0" : "pb-8"}>
                        <p
                          aria-current={isCurrent ? "step" : undefined}
                          className={`text-sm ${
                            isCurrent
                              ? "font-bold text-brand-navy"
                              : isCompleted
                                ? "font-semibold text-brand-navy"
                                : "font-medium text-ink-subtle"
                          }`}
                        >
                          {step}
                        </p>
                        {isCurrent && currentHistoryEntry && (
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {new Date(currentHistoryEntry.timestamp).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        {/* Live rider tracking (map + rider + ETA) — renders only when live */}
        <OrderLiveTracking
          orderId={String(orderId)}
          onLiveStatus={handleLiveStatus}
          className="mb-6"
        />

        {/* Order Items */}
        <div className="mb-6 overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="border-b border-line p-5 sm:p-6">
            <h2 className="text-lg font-bold text-brand-navy">Order Items</h2>
          </div>
          <div className="space-y-4 p-5 sm:p-6">
            {order.orderItems?.map((item: any, idx: number) => {
              const product = item.product || {};
              const productId = product._id || product.id || item.productId || "";
              return (
                <div key={idx} className="flex flex-col gap-3 rounded-card border border-line bg-surface-muted/60 p-4">
                  <div className="flex items-start gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        cloudinaryUrl(
                          item.productImage || product.images?.[0]?.url,
                          300,
                        ) || "/carousel/Clothes.jpg"
                      }
                      alt={item.productName || product.name || "Product"}
                      width={80}
                      height={80}
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-16 shrink-0 rounded-field object-cover ring-1 ring-line sm:h-20 sm:w-20"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-brand-navy">
                        {item.productName || product.name || "Product"}
                      </p>
                      <p className="font-mono text-[11px] text-ink-subtle">
                        #{String(productId).slice(-5)}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs text-ink-muted">
                        {product.description || "No description available."}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {/* unitPrice is the price paid at purchase time (snapshot);
                          fall back to the current product price for old orders. */}
                      <p className="text-sm font-bold text-brand-navy">
                        {formatPKR((item.unitPrice || product.price || 0))}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        Qty: {item.quantity}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
                    <Badge tone="neutral" size="sm">
                      Category: {product.category?.name || product.category || "General"}
                    </Badge>
                    {item.selectedColor && (
                      <Badge tone="neutral" size="sm">
                        Color: {item.selectedColor}
                      </Badge>
                    )}
                    {item.selectedSize && (
                      <Badge tone="neutral" size="sm">
                        Size: {item.selectedSize}
                      </Badge>
                    )}
                    {(item.customizationAnswers || []).map((ans: any, ansIdx: number) => {
                      const isImageValue =
                        typeof ans.value === "string" &&
                        /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(ans.value.trim());

                      return isImageValue ? (
                        <span
                          key={ansIdx}
                          className="inline-flex items-center gap-2 rounded-field border border-brand-gold/30 bg-brand-gold/[0.06] px-2 py-1.5"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={ans.value}
                            alt={ans.label}
                            width={40}
                            height={40}
                            loading="lazy"
                            decoding="async"
                            className="h-9 w-9 rounded-md object-cover ring-1 ring-line"
                          />
                          <span className="text-xs font-semibold text-brand-navy">
                            {ans.label}
                          </span>
                        </span>
                      ) : (
                        <Badge key={ansIdx} tone="gold" size="sm">
                          {ans.label}: {ans.value}
                        </Badge>
                      );
                    })}
                  </div>
                  {order.status === "Delivered" && productId && (
                    <RatingForm productId={productId} productName={product.name || "Product"} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Shipping + Payment Info */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line p-5">
              <MapPin size={16} aria-hidden className="text-ink-subtle" />
              <h2 className="text-sm font-bold text-brand-navy">Shipping Address</h2>
            </div>
            <div className="space-y-1 p-5 text-sm text-ink-muted">
              <p className="font-semibold text-brand-navy">{order.shippingAddress?.fullName}</p>
              <p>{order.shippingAddress?.phoneNo}</p>
              <p>{order.shippingAddress?.address}</p>
              <p>{order.shippingAddress?.city}, {order.shippingAddress?.country}</p>

              {(order.shippingAddress?.latitude != null && order.shippingAddress?.longitude != null) && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${order.shippingAddress.latitude}&mlon=${order.shippingAddress.longitude}#map=17/${order.shippingAddress.latitude}/${order.shippingAddress.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-gold-hover transition-colors hover:underline"
                >
                  <ExternalLink size={14} aria-hidden />
                  View on Map
                </a>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line p-5">
              <CreditCard size={16} aria-hidden className="text-ink-subtle" />
              <h2 className="text-sm font-bold text-brand-navy">Payment</h2>
            </div>
            <div className="space-y-2 p-5 text-sm text-ink-muted">
              <div className="flex justify-between">
                <span>Items</span>
                <span className="font-semibold text-brand-navy">
                  {formatPKR(order.itemsPrice)}
                </span>
              </div>
              {Number(order.walletRedemptionAmount || 0) > 0 && (
                <div className="flex justify-between text-state-success">
                  <span>Referral Wallet</span>
                  <span className="font-bold">
                    - {formatPKR(Number(order.walletRedemptionAmount))}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className="font-semibold text-brand-navy">
                  {formatPKR(order.shippingPrice)}
                </span>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-xs font-semibold uppercase tracking-wider">Total</span>
                <span className="text-lg font-black text-brand-navy">
                  {formatPKR(order.totalPrice)}
                </span>
              </div>
              <div className="pt-1">
                <Badge tone="info" size="sm">
                  {order.paymentMethod}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Referral Information (only when this order is referral-related) */}
        {hasReferralInfo && (
          <div className="mt-6 overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line p-5">
              <Gift size={16} aria-hidden className="text-brand-gold-hover" />
              <h2 className="text-sm font-bold text-brand-navy">Referral Information</h2>
            </div>
            <div className="space-y-2 p-5 text-sm text-ink-muted">
              {order.referralCode && (
                <p className="flex flex-wrap items-center gap-2">
                  <Gift size={14} aria-hidden className="shrink-0 text-brand-gold-hover" />
                  This order was placed using referral code{" "}
                  <span className="font-mono font-bold text-brand-navy">
                    {order.referralCode}
                  </span>{" "}
                  — the referrer earns a {DEFAULT_REWARD_PERCENTAGE}% reward once this order
                  is delivered.
                </p>
              )}
              {Number(order.walletRedemptionAmount || 0) > 0 && (
                <p className="flex flex-wrap items-center gap-2">
                  <Wallet size={14} aria-hidden className="shrink-0 text-brand-gold-hover" />
                  {formatPKR(Number(order.walletRedemptionAmount))} was paid from
                  your referral wallet balance.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Delivery-location editor — only reachable for Pending / Processing /
            Packed orders with no assigned rider (server re-validates on save) */}
        {showLocationModal && (
          <ChangeLocationModal
            orderId={String(orderId)}
            shippingAddress={order.shippingAddress}
            onSaved={(updated) => {
              // Server response replaces the local order so the address card and
              // the tracking history entry appear without a reload.
              if (updated) setOrder(updated);
            }}
            onRefresh={refreshOrder}
            onClose={() => setShowLocationModal(false)}
          />
        )}

        {/* Cancel confirmation modal — only reachable for Pending orders */}
        {showCancelModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/45 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Cancel order"
          >
            <div className="w-full max-w-md rounded-sheet bg-surface p-6 shadow-sheet">
              <h3 className="mb-2 text-lg font-bold text-brand-navy">
                Cancel this order?
              </h3>
              <p className="mb-4 text-sm text-ink-muted">
                Are you sure you want to cancel this order? This action cannot be
                undone — stock will be released back to the store.
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason (optional)"
                rows={3}
                maxLength={500}
                aria-label="Cancellation reason"
                className="mb-4 w-full resize-none rounded-field border border-line bg-surface px-3 py-2 text-sm text-brand-navy outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-brand-gold focus:ring-4 focus:ring-brand-gold/15"
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="md"
                  className="flex-1"
                  disabled={isCancelling}
                  onClick={() => setShowCancelModal(false)}
                >
                  Keep Order
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  className="flex-1"
                  loading={isCancelling}
                  onClick={handleCancelOrder}
                >
                  {isCancelling ? "Cancelling..." : "Yes, Cancel Order"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tracking History */}
        {order.trackingHistory?.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line p-5">
              <Clock size={16} aria-hidden className="text-ink-subtle" />
              <h2 className="text-sm font-bold text-brand-navy">Tracking History</h2>
            </div>
            <div className="p-5">
              <div className="space-y-3">
                {[...order.trackingHistory].reverse().map((entry: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 text-sm">
                    {/* The inactive dot was `bg-[#FFFFFF]` on a white card —
                        every historical entry except the current one was
                        invisible. */}
                    <span
                      aria-hidden
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        entry.status === order.status ? "bg-brand-gold" : "bg-line"
                      }`}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-semibold text-brand-navy">{entry.status}</span>
                      {entry.note && (
                        <span className="text-xs italic text-ink-muted">{entry.note}</span>
                      )}
                    </div>
                    <span className="ml-auto shrink-0 text-xs text-ink-subtle sm:text-sm">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderTrackingPage;
