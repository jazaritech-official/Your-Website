"use client";
import { formatPKR } from "@/app/utils/format";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { motion } from "framer-motion";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/app/Redux/store";
import { startLoading, stopLoading } from "@/app/Redux/Features/uiSlice";
import { listItemEnter } from "@/app/utils/motion";
import { Package, ChevronRight, ArrowLeft, Clock, MessageCircle, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { baseUrl, showToast, cloudinaryUrl } from "@/app/utils/commonFunctions";
import {
  Badge,
  buttonStyles,
  EmptyState,
  SectionLabel,
  StatusBadge,
} from "@/app/Components/ui";
import ProfileNav from "@/app/Components/ProfileNav";

/** Order-card skeleton — mirrors the real card so nothing shifts. */
function OrderCardSkeleton() {
  return (
    <div className="animate-pulse rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center gap-3">
        <div className="h-5 w-20 rounded-full bg-surface-muted" />
        <div className="h-5 w-24 rounded-full bg-surface-muted" />
      </div>
      <div className="mt-4 h-6 w-32 rounded bg-surface-muted" />
      <div className="mt-3 flex gap-3">
        <div className="h-3 w-24 rounded bg-surface-muted" />
        <div className="h-3 w-16 rounded bg-surface-muted" />
      </div>
    </div>
  );
}

const MyOrdersPage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const auth = useSelector((state: RootState) => state.auth);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Open the existing chat with this order attached as conversation context.
  const handleChatAboutOrder = (orderId: string) => {
    router.push(`/chat?order=${orderId}`);
  };

  useEffect(() => {
    if (!auth.username) return;
    const fetchOrders = async () => {
      dispatch(startLoading("ZF Loading Orders"));
      setLoading(true);
      try {
        // F-005: bound the response to 50 most recent orders (page 1) —
        // avoids unbounded payload for customers with many orders.
        const res = await axios.get(`${baseUrl}order/myOrders?page=1&limit=50`, { withCredentials: true });
        const payload = res.data?.data;
        const ordersList = Array.isArray(payload) ? payload : payload?.orders ?? [];
        setOrders(ordersList);
      } catch (err: any) {
        showToast(err?.response?.data?.message || "Failed to load orders", "error");
      } finally {
        setLoading(false);
        dispatch(stopLoading());
      }
    };
    fetchOrders();
  }, [auth.username]);

  // Route guard: same inline fallback used by the profile / wishlist pages.
  if (!auth.username) {
    return (
      <main className="min-h-screen bg-surface-page px-4 pb-16 pt-10">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={<Lock size={26} />}
            title="Sign in to view your orders"
            description="Once you sign in, every order you place appears here with live tracking."
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

  return (
    <div className="min-h-screen bg-surface-page px-4 pb-16 pt-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/profile"
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-brand-gold-hover"
        >
          <ArrowLeft size={16} /> Back to Profile
        </Link>

        <header className="mb-5">
          <SectionLabel>Purchase history</SectionLabel>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-brand-navy sm:text-4xl">
              My Orders
            </h1>
            {!loading && orders.length > 0 && (
              <Badge tone="neutral" size="md" dot>
                {orders.length} {orders.length === 1 ? "order" : "orders"}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Track and manage every order you have placed with Irhas&apos;Inn.
          </p>
        </header>

        <ProfileNav />

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <OrderCardSkeleton key={i} />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<Package size={26} />}
            title="No orders yet"
            description="When you place your first order it will show up here with its live delivery status."
            action={
              <Link href="/productsPage" className={buttonStyles({ variant: "gold", size: "md" })}>
                Start Shopping
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            {orders.map((order, orderIndex) => {
              const items = (order.orderItems || []) as Array<{
                productImage?: string;
                product?: { images?: { url: string }[] };
              }>;
              const thumbs = items
                .map((it) => it.productImage || it.product?.images?.[0]?.url)
                .filter((url): url is string => Boolean(url))
                .slice(0, 3);

              return (
                <motion.article
                  key={order._id}
                  {...listItemEnter(orderIndex)}
                  className="overflow-hidden rounded-card border border-line bg-surface shadow-card transition-shadow duration-200 hover:shadow-card-hover"
                >
                  <Link href={`/profile/orders/${order._id}`} className="block p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-surface-muted px-2 py-1 font-mono text-[11px] font-semibold text-ink-muted">
                            #{order.serialNumber || order._id.slice(-8)}
                          </span>
                          <StatusBadge status={order.status || "pending"} />
                        </div>

                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-bold tracking-tight text-brand-navy">
                            {formatPKR(order.totalPrice)}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                          <span className="flex items-center gap-1">
                            <Clock size={12} aria-hidden />
                            {new Date(order.createdAt).toLocaleDateString()}
                          </span>
                          <span>
                            {items.length} {items.length === 1 ? "item" : "items"}
                          </span>
                        </div>
                      </div>

                      {/* Real item thumbnails — no invented imagery. */}
                      {thumbs.length > 0 && (
                        <div className="hidden shrink-0 items-center gap-2 sm:flex">
                          {thumbs.map((url: string, i: number) => (
                            <img
                              key={i}
                              src={cloudinaryUrl(url, 120) || "/carousel/Clothes.jpg"}
                              alt=""
                              aria-hidden
                              className="h-12 w-12 rounded-lg border border-line object-cover"
                            />
                          ))}
                        </div>
                      )}

                      <ChevronRight
                        size={20}
                        className="mt-1 shrink-0 text-ink-subtle"
                        aria-hidden
                      />
                    </div>
                  </Link>

                  <div className="border-t border-line-soft px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => handleChatAboutOrder(order._id)}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-[0.55rem] border border-brand-gold/40 bg-brand-gold/[0.07] px-3.5 py-2 text-xs font-bold text-brand-navy transition-colors duration-200 hover:bg-brand-gold/15"
                    >
                      <MessageCircle size={14} aria-hidden />
                      Chat About This Order
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyOrdersPage;
