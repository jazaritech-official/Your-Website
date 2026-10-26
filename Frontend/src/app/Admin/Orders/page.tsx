"use client";
import { formatPKR } from "@/app/utils/format";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Download, Eye, Trash2, ChevronDown, ChevronUp, Printer, ExternalLink } from "lucide-react";
import useFetch, {
  baseUrl,
  showToast,
  invalidateCache,
} from "@/app/utils/commonFunctions";

const ORDERS_CACHE_KEY = "admin_orders";
const ORDERS_CACHE_TTL = 30_000; // 30 seconds

// Table-row skeleton shown while orders are loading so navigating back to
// this page feels instant instead of blank.
const TableSkeleton = ({ rows = 8 }: { rows?: number }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <tr key={i} className="animate-pulse border-b border-slate-100">
        <td className="p-4"><div className="h-3 w-10 rounded bg-gray-200" /></td>
        <td className="p-4"><div className="h-3 w-32 rounded bg-gray-200" /></td>
        <td className="p-4"><div className="h-3 w-24 rounded bg-gray-200" /></td>
        <td className="p-4"><div className="h-3 w-20 rounded bg-gray-200" /></td>
        <td className="p-4"><div className="h-6 w-28 rounded-full bg-gray-200" /></td>
        <td className="p-4"><div className="h-6 w-28 rounded-full bg-gray-200" /></td>
        <td className="p-4"><div className="h-3 w-20 rounded bg-gray-200" /></td>
        <td className="p-4"><div className="ml-auto h-6 w-24 rounded bg-gray-200" /></td>
      </tr>
    ))}
  </>
);
import axios from "axios";
// QRCode is dynamically imported where used (line ~154) to reduce bundle size
import LiveCustomPreview from "@/app/Components/LiveCustomPreview";
import { usePreviewSync } from "@/app/utils/usePreviewSync";
import { isImageUrlValue } from "@/app/utils/customizationPreview";
import { useSocket } from "@/app/utils/PusherSocketProvider";

const paymentStatusOptions = [
  "pending",
  "paid",
  "failed",
  "refunded",
  "cancelled",
];

const orderStatusOptions = [
  "Pending",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Reached Destination",
  "Delivered",
  "Cancelled",
];

// Lightweight inline SVG placeholder used when a product image is missing
// (e.g., the referenced product was deleted after the order was placed).
const PLACEHOLDER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23e2e8f0'/%3E%3Cpath d='M0 64 L28 36 L44 52 L60 32 L80 56' stroke='%2394a3b8' stroke-width='3' fill='none'/%3E%3Ccircle cx='26' cy='24' r='8' fill='%2394a3b8'/%3E%3C/svg%3E";

const ORDERS_PER_PAGE = 20;

const OrdersPage = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const {
    data: ordersRes,
    loading,
    reFetch,
  } = useFetch<any>(
    `${baseUrl}order/getAllOrders?page=${currentPage}&limit=${ORDERS_PER_PAGE}${statusFilter !== "all" ? `&status=${encodeURIComponent(statusFilter)}` : ""}`,
    { cacheKey: `${ORDERS_CACHE_KEY}_${statusFilter}`, staleTime: ORDERS_CACHE_TTL },
  );
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedPaymentStatuses, setSelectedPaymentStatuses] = useState<
    Record<string, string>
  >({});
  const [selectedOrderStatuses, setSelectedOrderStatuses] = useState<
    Record<string, string>
  >({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({});
  const [expandedOrderIds, setExpandedOrderIds] = useState<
    Record<string, boolean>
  >({});
  const [printOrders, setPrintOrders] = useState<any[]>([]);
  const [printQr, setPrintQr] = useState<Record<string, string>>({});
  const [isGeneratingPrint, setIsGeneratingPrint] = useState(false);

  /* ── AI Live Custom Preview ── */
  // Live-synced answers (keyed by product id) arriving over the socket.
  const [remoteAnswers, setRemoteAnswers] = useState<
    Record<string, Array<{ label: string; value: string }>>
  >({});
  const [removeBgFor, setRemoveBgFor] = useState<Record<string, boolean>>({});

  // Join the preview room of the currently-expanded order's customer so we
  // see their design evolve live (same socket, no duplicate connections).
  const expandedOrder = orders.find((o) => expandedOrderIds[o._id]);
  const previewRoomId = useMemo(
    () =>
      expandedOrder?.user?._id ? `user:${expandedOrder.user._id}` : null,
    [expandedOrder],
  );
  const { remote: previewRemote } = usePreviewSync(previewRoomId);

  useEffect(() => {
    const items = previewRemote?.items ?? [];
    if (!items.length) return;
    setRemoteAnswers((prev) => {
      const next = { ...prev };
      items.forEach((it) => {
        if (it?.productId) next[it.productId] = it.answers || [];
      });
      return next;
    });
  }, [previewRemote]);

  // Server-side filtering: status is sent as a query param to the backend
  const visibleOrders = orders;

  /* ── Real-time refresh: when a status changes (e.g. the customer cancels
     their order), the socket event fires and this table re-fetches so the
     admin panel reflects it instantly instead of waiting for cache expiry. ── */
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    // `tracking:destination` (customer changed a delivery location) needs the
    // exact same treatment as a status change here, because the table renders
    // the order's shipping address — so the SAME handler is bound to both.
    const onStatus = (data: any) => {
      if (!data?.orderId) return;
      invalidateCache(ORDERS_CACHE_KEY);
      reFetch();
    };
    socket.on("tracking:status", onStatus);
    socket.on("tracking:destination", onStatus);
    return () => {
      socket.off("tracking:status", onStatus);
      socket.off("tracking:destination", onStatus);
    };
  }, [socket, reFetch]);

  const FRONTEND_URL =
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ||
    "https://irhasinn.vercel.app";

  const generateQr = async (orderId: string) => {
    const url = `${FRONTEND_URL}/track-order/${orderId}`;
    try {
      const QRCode = (await import("qrcode")).default;
      return await QRCode.toDataURL(url, { width: 160, margin: 1 });
    } catch {
      return "";
    }
  };

  const buildPrintView = async (ordersToPrint: any[]) => {
    setIsGeneratingPrint(true);
    const qrMap: Record<string, string> = {};
    for (const o of ordersToPrint) {
      qrMap[o._id] = await generateQr(o._id);
    }
    setPrintOrders(ordersToPrint);
    setPrintQr(qrMap);
    setIsGeneratingPrint(false);
    // Allow React to render the hidden print section before opening dialog
    setTimeout(() => window.print(), 300);
  };

  const handlePrintOne = (order: any) => buildPrintView([order]);
  const handlePrintAll = () => buildPrintView(orders);

  useEffect(() => {
    const payload = ordersRes?.data;
    if (payload) {
      const ordersArray = Array.isArray(payload) ? payload : payload.orders ?? [];
      setOrders(ordersArray);
      setTotalPages(payload.pagination?.totalPages ?? 1);
      setTotalOrders(payload.pagination?.total ?? 0);
      const initialPaymentStatuses: Record<string, string> = {};
      const initialOrderStatuses: Record<string, string> = {};
      ordersArray.forEach((order: any) => {
        if (order?._id) {
          initialPaymentStatuses[order._id] = order.paymentStatus || "pending";
          initialOrderStatuses[order._id] = order.status || "Pending";
        }
      });
      setSelectedPaymentStatuses(initialPaymentStatuses);
      setSelectedOrderStatuses(initialOrderStatuses);
    }
  }, [ordersRes]);

  const handleDelete = async (orderId: string) => {
    if (!orderId) return;
    setIsDeleting(true);

    try {
      await axios.delete(`${baseUrl}order/deleteOrder/${orderId}`, { withCredentials: true });
      setOrders((prev) => prev.filter((order) => order._id !== orderId));
      showToast("Order deleted successfully", "success");
      invalidateCache(ORDERS_CACHE_KEY);
      reFetch();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to delete order",
        "error",
      );
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePaymentStatusChange = (orderId: string, value: string) => {
    setSelectedPaymentStatuses((prev) => ({ ...prev, [orderId]: value }));
  };

  const handleOrderStatusChange = (orderId: string, value: string) => {
    setSelectedOrderStatuses((prev) => ({ ...prev, [orderId]: value }));
  };

  const handleUpdatePaymentStatus = async (orderId: string) => {
    if (!orderId) return;
    const newStatus = selectedPaymentStatuses[orderId];
    if (!newStatus) return;

    setIsUpdating((prev) => ({ ...prev, [orderId]: true }));

    try {
      const { data } = await axios.put(
        `${baseUrl}order/updateOrder/${orderId}`,
        {
          paymentStatus: newStatus,
        },
        { withCredentials: true },
      );

      setOrders((prev) =>
        prev.map((order) =>
          order._id === orderId
            ? { ...order, paymentStatus: data.data.paymentStatus }
            : order,
        ),
      );
      invalidateCache(ORDERS_CACHE_KEY);
      showToast("Payment status updated", "success");
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to update payment status",
        "error",
      );
      console.error(error);
    } finally {
      setIsUpdating((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const handleUpdateOrderStatus = async (orderId: string) => {
    if (!orderId) return;
    const newStatus = selectedOrderStatuses[orderId];
    if (!newStatus) return;

    setIsUpdating((prev) => ({ ...prev, [orderId]: true }));

    try {
      const { data } = await axios.patch(
        `${baseUrl}order/${orderId}/status`,
        {
          status: newStatus,
        },
        { withCredentials: true },
      );

      setOrders((prev) =>
        prev.map((order) =>
          order._id === orderId
            ? { ...order, status: data.data.status }
            : order,
        ),
      );
      invalidateCache(ORDERS_CACHE_KEY);
      showToast("Order status updated", "success");
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to update order status",
        "error",
      );
      console.error(error);
    } finally {
      setIsUpdating((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const toggleOrderDetails = (orderId: string) => {
    setExpandedOrderIds((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Order Management
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Track and update customer orders
          </p>
        </div>
        <button className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
          <Download className="h-4 w-4 text-orange-500" /> Export CSV
        </button>
        <button
          onClick={handlePrintAll}
          disabled={isGeneratingPrint || orders.length === 0}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[#0856DF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8] disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          {isGeneratingPrint ? "Preparing..." : "Print All"}
        </button>
      </div>

      {/* Status filter — radio buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status:</span>
        <div className="flex flex-wrap gap-1.5">
          {["all", ...orderStatusOptions].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setStatusFilter(opt);
                setCurrentPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === opt
                  ? "bg-[#0856DF] text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-[#0856DF]/40 hover:text-[#0856DF]"
              }`}
            >
              {opt === "all" ? "All" : opt}
            </button>
          ))}
        </div>
        {statusFilter !== "all" && (
          <button
            onClick={() => { setStatusFilter("all"); setCurrentPage(1); }}
            className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition"
          >
            ✕ Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[920px] text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="p-4">#</th>
              <th className="p-4">Order ID</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Total</th>
              <th className="p-4">Payment</th>
              <th className="p-4">Order Status</th>
              <th className="p-4">Created</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading && orders.length === 0 ? (
              <TableSkeleton rows={8} />
            ) : orders.length > 0 ? (
              visibleOrders.map((order) => (
                <Fragment key={order._id}>
                  <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                    <td className="p-4 font-mono font-semibold text-orange-500">
                      {order.serialNumber || "—"}
                    </td>
                    <td className="max-w-[180px] p-4 font-mono text-xs text-slate-600">
                      {order._id}
                    </td>
                    <td className="p-4 font-medium text-slate-800">
                      {order.user?.username || order.user?.email || "Unknown"}
                    </td>
                    <td className="p-4 font-semibold text-slate-900">
                      Rs {order.totalPrice?.toLocaleString() || 0}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-2">
                        <select
                          value={
                            selectedPaymentStatuses[order._id] ||
                            order.paymentStatus ||
                            "pending"
                          }
                          onChange={(e) =>
                            handlePaymentStatusChange(order._id, e.target.value)
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/10"
                        >
                          {paymentStatusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </option>
                          ))}
                        </select>
                        {selectedPaymentStatuses[order._id] &&
                          selectedPaymentStatuses[order._id] !==
                          order.paymentStatus ? (
                          <button
                            type="button"
                            onClick={() => handleUpdatePaymentStatus(order._id)}
                            disabled={isUpdating[order._id]}
                            className="self-start rounded-xl bg-[#0856DF] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[#0645c8] disabled:opacity-60"
                          >
                            {isUpdating[order._id] ? "Updating..." : "Update"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-2">
                        <select
                          value={
                            selectedOrderStatuses[order._id] ||
                            order.status ||
                            "Pending"
                          }
                          onChange={(e) =>
                            handleOrderStatusChange(order._id, e.target.value)
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/10"
                        >
                          {orderStatusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        {/* Customer-cancel badge — distinguishes customer
                            cancellations from admin ones at a glance. */}
                        {order.cancelledBy === "customer" && (
                          <span className="mt-1 w-max rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                            Cancelled By Customer
                          </span>
                        )}
                        {selectedOrderStatuses[order._id] &&
                          selectedOrderStatuses[order._id] !== order.status ? (
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus(order._id)}
                            disabled={isUpdating[order._id]}
                            className="self-start rounded-xl bg-[#0856DF] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[#0645c8] disabled:opacity-60"
                          >
                            {isUpdating[order._id] ? "Updating..." : "Update"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-4 text-slate-500">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toggleOrderDetails(order._id)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          title="Toggle order details"
                        >
                          {expandedOrderIds[order._id] ? (
                            <ChevronUp className="h-5 w-5" />
                          ) : (
                            <ChevronDown className="h-5 w-5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintOne(order)}
                          disabled={isGeneratingPrint}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                          title="Print report"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(order._id)}
                          disabled={isDeleting}
                          className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
                          aria-label="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedOrderIds[order._id] ? (
                    <tr className="bg-slate-50/70">
                      <td
                        colSpan={8}
                        className="p-4 text-sm text-slate-700"
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-3">
                            <h3 className="font-semibold text-slate-900">
                              Order Items
                            </h3>
                            {order.orderItems?.map((item: any, idx: number) => {
                              const product = item.product || {};
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                                >
                                  <img
                                    src={
                                      item.productImage ||
                                      product?.images?.[0]?.url ||
                                      item?.images?.[0] ||
                                      PLACEHOLDER_IMG
                                    }
                                    alt={item.productName || product?.name || "Product Image"}
                                    className="h-20 w-20 rounded-lg object-cover"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).src =
                                        PLACEHOLDER_IMG;
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-900">
                                      {item.productName ||
                                        product?.name ||
                                        item?.name ||
                                        "Product"}
                                    </p>
                                    {/* Variant badges */}
                                    {(item.selectedColor || item.selectedSize) && (
                                      <div className="mt-1 flex flex-wrap gap-1.5">
                                        {item.selectedColor && (
                                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                            {item.selectedColor}
                                          </span>
                                        )}
                                        {item.selectedSize && (
                                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                            Size {item.selectedSize}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    <p className="mt-1 text-xs text-slate-500">
                                      Qty {item.quantity} × {formatPKR((item.unitPrice || product?.price || item?.price || 0))}
                                    </p>
                                    <p className="text-xs font-semibold text-slate-700">
                                      Subtotal: {formatPKR(((item.unitPrice || product?.price || item?.price || 0) * item.quantity))}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      ID: {product?._id?.toString().slice(-6) || item?.product?._id?.toString().slice(-6) || "N/A"}
                                    </p>
                                    {(() => {
                                      const answers =
                                        remoteAnswers[(product._id as string | undefined)?.toString?.() ?? ""] ??
                                        item.customizationAnswers ??
                                        [];
                                      if (!answers.length) return null;
                                      const itemKey = `${order._id}-${idx}`;
                                      const hasImages = answers.some((a) => isImageUrlValue(a.value));
                                      return (
                                        <div className="mt-3">
                                          <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                                              AI Live Preview
                                            </span>
                                            <div className="ml-auto flex items-center gap-2">
                                              {hasImages && (
                                                <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-slate-600">
                                                  <input
                                                    type="checkbox"
                                                    checked={!!removeBgFor[itemKey]}
                                                    onChange={() =>
                                                      setRemoveBgFor((p) => ({
                                                        ...p,
                                                        [itemKey]: !p[itemKey],
                                                      }))
                                                    }
                                                    className="accent-[#0856DF]"
                                                  />
                                                  Remove background
                                                </label>
                                              )}
                                            </div>
                                          </div>
                                          <LiveCustomPreview
                                            productImage={item.productImage || product?.images?.[0]?.url || item?.images?.[0] || PLACEHOLDER_IMG}
                                            rawAnswers={answers}
                                            removeBackground={!!removeBgFor[itemKey]}
                                            printLayout={item.printLayout ?? product?.printLayout}
                                            showEmptyHint={false}
                                          />
                                          <p className="mt-1.5 text-[10px] text-slate-400">
                                            Live-synced — updates instantly when the customer changes their design.
                                          </p>
                                        </div>
                                      );
                                    })()}

                                    {item.customizationAnswers?.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-600">
                                        {item.customizationAnswers.map((ans: any, ansIdx: number) => {
                                          const isImageValue =
                                            typeof ans.value === "string" &&
                                            /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(ans.value.trim());

                                          return isImageValue ? (
                                            <div
                                              key={ansIdx}
                                              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                                            >
                                              <img
                                                src={ans.value}
                                                alt={ans.label}
                                                className="h-10 w-10 rounded-md object-cover"
                                              />
                                              <span className="text-xs font-medium text-slate-600">{ans.label}</span>
                                            </div>
                                          ) : (
                                            <span
                                              key={ansIdx}
                                              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold"
                                            >
                                              {ans.label}: {ans.value}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="space-y-3">
                            <h3 className="font-semibold text-slate-900">
                              Shipping & Payment
                            </h3>
                            <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                              <p>
                                <span className="font-semibold">Name:</span>{" "}
                                {order.shippingAddress?.fullName}
                              </p>
                              <p>
                                <span className="font-semibold">Phone:</span>{" "}
                                {order.shippingAddress?.phoneNo}
                              </p>
                              <p>
                                <span className="font-semibold">Address:</span>{" "}
                                {order.shippingAddress?.address}
                              </p>
                              <p>
                                <span className="font-semibold">City:</span>{" "}
                                {order.shippingAddress?.city}
                              </p>
                              <p>
                                <span className="font-semibold">Country:</span>{" "}
                                {order.shippingAddress?.country}
                              </p>
                              {(order.shippingAddress?.latitude != null && order.shippingAddress?.longitude != null) && (
                                <p>
                                  <a
                                    href={`https://www.openstreetmap.org/?mlat=${order.shippingAddress.latitude}&mlon=${order.shippingAddress.longitude}#map=17/${order.shippingAddress.latitude}/${order.shippingAddress.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0856DF] hover:underline"
                                  >
                                    <ExternalLink size={12} />
                                    View on Map
                                  </a>
                                </p>
                              )}
                              <p>
                                <span className="font-semibold">
                                  Payment Method:
                                </span>{" "}
                                {order.paymentMethod}
                              </p>
                              <p>
                                <span className="font-semibold">
                                  Payment Status:
                                </span>{" "}
                                {order.paymentStatus}
                              </p>
                              <p>
                                <span className="font-semibold">
                                  Order Status:
                                </span>{" "}
                                {order.status}
                              </p>
                            </div>
                            {/* Cancellation details — who cancelled, when, and
                                the customer's optional reason. The tracking
                                history entry with the same note is visible in
                                Admin → Tracking → View Timeline. */}
                            {order.status === "Cancelled" && (
                              <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3">
                                <p className="text-xs font-bold text-red-600">
                                  {order.cancelledBy === "customer"
                                    ? "Cancelled By Customer"
                                    : "Cancelled"}
                                </p>
                                {order.cancelledAt && (
                                  <p className="mt-1 text-xs text-red-500">
                                    Cancelled:{" "}
                                    {new Date(order.cancelledAt).toLocaleString()}
                                  </p>
                                )}
                                {order.cancelReason && (
                                  <p className="mt-1 text-xs text-red-500">
                                    Reason: {order.cancelReason}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="p-10 text-center">
                  <p className="font-medium text-slate-500">No orders found.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 mt-4">
          <p className="text-sm text-gray-500">
            Showing{" "}
            <span className="font-medium text-[#222831]">
              {((currentPage - 1) * ORDERS_PER_PAGE) + 1}
            </span>{" "}
            –{" "}
            <span className="font-medium text-[#222831]">
              {Math.min(currentPage * ORDERS_PER_PAGE, totalOrders)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-[#222831]">
              {totalOrders}
            </span>{" "}
            orders
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#C8A84E] hover:text-[#C8A84E] transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#C8A84E] hover:text-[#C8A84E] transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Hidden printable order reports (3 per A4 page) */}
      <div className="print-reports">
        {printOrders.map((order) => (
          <div key={order._id} className="order-report-block">
            {/* Header: logo + store name + receipt label + QR */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                borderBottom: "2px solid #0f172a",
                paddingBottom: "5px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/Irha Studio-12.jpg"
                  alt="Irhas'Inn"
                  style={{ width: 30, height: 30, objectFit: "contain" }}
                />
                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 800,
                      color: "#0f172a",
                      lineHeight: 1.1,
                    }}
                  >
                    Irhas'Inn
                  </div>
                  <div
                    style={{
                      fontSize: "8px",
                      fontWeight: 600,
                      letterSpacing: "1px",
                      color: "#0856DF",
                      textTransform: "uppercase",
                    }}
                  >
                    Order Receipt
                  </div>
                </div>
              </div>
              {printQr[order._id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={printQr[order._id]}
                  alt="Track order QR"
                  style={{ width: 56, height: 56 }}
                />
              ) : null}
            </div>

            {/* Meta strip */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "2px 16px",
                fontSize: "9px",
                color: "#334155",
                padding: "4px 0",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <span>
                <strong style={{ color: "#0f172a" }}>Order ID:</strong>{" "}
                <span style={{ fontFamily: "monospace" }}>{order._id}</span>
              </span>
              {order.serialNumber ? (
                <span>
                  <strong style={{ color: "#0f172a" }}>Serial #:</strong>{" "}
                  {order.serialNumber}
                </span>
              ) : null}
              <span>
                <strong style={{ color: "#0f172a" }}>Date:</strong>{" "}
                {new Date(order.createdAt).toLocaleDateString()}
              </span>
              <span>
                <strong style={{ color: "#0f172a" }}>Customer:</strong>{" "}
                {order.user?.username || order.user?.email || "—"}
              </span>
            </div>

            {/* Itemized table */}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "9px",
                color: "#0f172a",
                marginTop: "4px",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #cbd5e1" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "2px 4px",
                      fontWeight: 700,
                      color: "#475569",
                    }}
                  >
                    Item
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "2px 4px",
                      fontWeight: 700,
                      color: "#475569",
                    }}
                  >
                    Qty
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "2px 4px",
                      fontWeight: 700,
                      color: "#475569",
                    }}
                  >
                    Price
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "2px 4px",
                      fontWeight: 700,
                      color: "#475569",
                    }}
                  >
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {(order.orderItems || []).map((item: any, idx: number) => {
                  const unit = item.unitPrice || item.product?.price || item.price || 0;
                  const qty = item.quantity || 1;
                  return (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: "1px solid #eef2f7",
                        background: idx % 2 === 1 ? "#f8fafc" : "transparent",
                      }}
                    >
                      <td
                        style={{
                          padding: "2px 4px",
                          maxWidth: "90px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.product?.name || item.name || "Product"}
                      </td>
                      <td style={{ padding: "2px 4px", textAlign: "right" }}>
                        {qty}
                      </td>
                      <td style={{ padding: "2px 4px", textAlign: "right" }}>
                        {formatPKR(unit)}
                      </td>
                      <td style={{ padding: "2px 4px", textAlign: "right" }}>
                        {formatPKR((unit * qty))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Total row (light accent, print-safe) */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "4px",
                padding: "4px 6px",
                background: "#eef4ff",
                border: "1px solid #c7dbff",
                borderRadius: "3px",
                fontSize: "11px",
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              <span>TOTAL</span>
              <span>Rs {order.totalPrice?.toLocaleString() || 0}</span>
            </div>

            {/* Footer: status + shipping + scan label */}
            <div
              style={{
                fontSize: "8px",
                color: "#475569",
                marginTop: "4px",
                borderTop: "1px dashed #cbd5e1",
                paddingTop: "3px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  Status: <strong>{order.status}</strong>
                </span>
                <span>
                  Payment: <strong>{order.paymentStatus}</strong> (
                  {order.paymentMethod})
                </span>
              </div>
              <div style={{ marginTop: "2px" }}>
                <strong>Ship to:</strong> {order.shippingAddress?.fullName},{" "}
                {order.shippingAddress?.address}, {order.shippingAddress?.city},{" "}
                {order.shippingAddress?.country} ({order.shippingAddress?.phoneNo})
              </div>
              <div style={{ marginTop: "2px", color: "#64748b" }}>
                Scan QR to track your order: {FRONTEND_URL}/track-order/{order._id}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrdersPage;
