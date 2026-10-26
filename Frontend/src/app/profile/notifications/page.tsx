"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/app/Redux/store";
import { startLoading, stopLoading } from "@/app/Redux/Features/uiSlice";
import {
  Bell,
  ChevronRight,
  ArrowLeft,
  Clock,
  CheckCheck,
  BellOff,
} from "lucide-react";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import { useSocket } from "@/app/utils/PusherSocketProvider";
import ProfileNav from "@/app/Components/ProfileNav";
import { motion } from "framer-motion";
import { EASE_STANDARD } from "@/app/utils/motion";
import {
  Button,
  EmptyState,
  ErrorState,
  SectionLabel,
  buttonStyles,
} from "@/app/Components/ui";

/** Notification-row skeleton — mirrors the real row box. */
function NotificationSkeleton() {
  return (
    <li className="flex items-start gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-field bg-surface-muted" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-surface-muted" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-muted" />
        <div className="h-2.5 w-28 animate-pulse rounded bg-surface-muted" />
      </div>
    </li>
  );
}

const NotificationsPage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAllAsRead, setMarkingAllAsRead] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  /* The API already returns the GLOBAL unread count. The page previously
     counted only the notifications loaded on this page, so the header could
     claim "0 unread" while unread items sat on later pages. */
  const [unreadTotal, setUnreadTotal] = useState(0);
  /* A failed fetch used to fall through to the "No notifications yet" empty
     state, which read as "you have none" instead of "this failed". */
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchNotifications = useCallback(
    async (pageNum: number = 1) => {
      if (!auth.username) return;
      dispatch(startLoading("Loading Notifications"));
      setLoading(true);
      try {
        const res = await axios.get(
          `${baseUrl}notifications?page=${pageNum}&limit=20`,
          { withCredentials: true }
        );
        const data = res.data?.data || {};
        if (pageNum === 1) {
          setNotifications(data.notifications || []);
        } else {
          setNotifications((prev) => [...prev, ...(data.notifications || [])]);
        }
        setTotal(data.total || 0);
        setUnreadTotal(data.unreadCount ?? 0);
        setTotalPages(data.totalPages || 1);
        setPage(pageNum);
        setLoadError(null);
      } catch (err: any) {
        const message =
          err?.response?.data?.message || "Failed to load notifications";
        setLoadError(message);
        showToast(message, "error");
      } finally {
        setLoading(false);
        dispatch(stopLoading());
      }
    },
    [auth.username, dispatch]
  );

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  // Live-update the list when a new notification arrives over the socket
  // (e.g. order reached/delivered) — no manual refresh required.
  const { onNewNotification, offNewNotification } = useSocket();
  useEffect(() => {
    if (!auth.username) return;
    const handleNewNotif = (notif: any) => {
      if (!notif?._id) return;
      setNotifications((prev) => {
        const exists = prev.some((n) => n._id === notif._id);
        return exists ? prev : [notif, ...prev];
      });
      setTotal((prev) => prev + 1);
      if (!notif.isRead) setUnreadTotal((prev) => prev + 1);
    };
    onNewNotification(handleNewNotif);
    return () => offNewNotification(handleNewNotif);
  }, [auth.username, onNewNotification, offNewNotification]);

  const handleMarkAllAsRead = async () => {
    setMarkingAllAsRead(true);
    try {
      await axios.patch(
        `${baseUrl}notifications/mark-as-read`,
        {},
        { withCredentials: true }
      );
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true }))
      );
      setUnreadTotal(0);
      showToast("All notifications marked as read", "success");
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to mark as read",
        "error"
      );
    } finally {
      setMarkingAllAsRead(false);
    }
  };

  const handleNotifClick = async (notif: any) => {
    // Mark as read if unread
    if (!notif.isRead) {
      try {
        await axios.patch(
          `${baseUrl}notifications/${notif._id}/read`,
          {},
          { withCredentials: true }
        );
        setNotifications((prev) =>
          prev.map((n) =>
            n._id === notif._id ? { ...n, isRead: true } : n
          )
        );
        setUnreadTotal((prev) => Math.max(0, prev - 1));
      } catch (err) { console.error("[silent-catch page.tsx]", err); }
    }
    // Navigate — internal links go through the client router instead of a full
    // document reload (same navigation target, no re-download of the app).
    if (notif.link) {
      if (/^https?:\/\//i.test(notif.link)) {
        window.location.assign(notif.link);
      } else {
        router.push(notif.link);
      }
    }
  };

  const handleLoadMore = () => {
    if (page < totalPages) {
      fetchNotifications(page + 1);
    }
  };

  const unreadCount = unreadTotal;

  // Route guard: same inline fallback used by the profile / wishlist pages.
  if (!auth.username) {
    return (
      <main className="min-h-screen bg-surface-page px-4 pb-16 pt-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={<Bell size={26} />}
            title="Sign in to see your notifications"
            description="Order updates and announcements are delivered to your account."
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
    <div className="min-h-screen bg-surface-page px-4 pb-16 pt-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/profile"
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-brand-gold-hover"
        >
          <ArrowLeft size={16} /> Back to Profile
        </Link>

        {/* Header */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <SectionLabel>Your account</SectionLabel>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-brand-navy sm:text-4xl">
              Notifications
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {total > 0
                ? `${total} notification${total > 1 ? "s" : ""} — ${unreadCount} unread`
                : "Stay updated with your orders and more"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              loading={markingAllAsRead}
              icon={<CheckCheck size={13} aria-hidden />}
              onClick={handleMarkAllAsRead}
            >
              {markingAllAsRead ? "Marking…" : "Mark All Read"}
            </Button>
          )}
        </header>

        <ProfileNav />

        {/* Loading State */}
        {loading && notifications.length === 0 ? (
          <ul className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </ul>
        ) : loadError && notifications.length === 0 ? (
          /* A real failure is surfaced as one — never as an empty inbox. */
          <ErrorState
            title="We couldn't load your notifications"
            message={loadError}
            onRetry={() => fetchNotifications(1)}
          />
        ) : notifications.length === 0 ? (
          /* Empty State */
          <EmptyState
            icon={<BellOff size={26} />}
            title="No notifications yet"
            description="Order updates, delivery milestones and announcements will appear here."
            action={
              <Link href="/productsPage" className={buttonStyles({ variant: "gold", size: "md" })}>
                Browse Products
              </Link>
            }
          />
        ) : (
          /* Notifications List */
          <ul className="space-y-3">
            {notifications.map((notif: any, i: number) => (
              <motion.li
                key={notif._id}
                /* MOTION ONLY — the newest row (index 0, which is where the
                   real-time Pusher handler prepends) animates in. Every other
                   row keeps its stable _id key and therefore never re-animates,
                   capping the cost at a single animated node. */
                initial={i === 0 ? { opacity: 0, y: -10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: EASE_STANDARD }}
              >
                <button
                  type="button"
                  onClick={() => handleNotifClick(notif)}
                  className={`w-full rounded-card border bg-surface p-5 text-left shadow-card transition-[box-shadow,transform,border-color] hover:-translate-y-px hover:shadow-card-hover ${
                    !notif.isRead
                      ? "border-l-4 border-brand-gold border-y-line border-r-line"
                      : "border-line"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-field transition-colors duration-300 ${
                        !notif.isRead
                          ? "bg-brand-gold/12 text-brand-gold-hover"
                          : "bg-surface-muted text-ink-subtle"
                      }`}
                    >
                      <Bell size={18} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`truncate text-sm transition-colors duration-200 ${
                            !notif.isRead
                              ? "font-bold text-brand-navy"
                              : "font-semibold text-ink-muted"
                          }`}
                        >
                          {notif.title}
                        </p>
                        {!notif.isRead && (
                          <>
                            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand-gold" />
                            <span className="sr-only">Unread</span>
                          </>
                        )}
                      </div>
                      <p
                        className={`mt-1 line-clamp-2 text-xs ${
                          !notif.isRead
                            ? "font-medium text-ink"
                            : "text-ink-muted"
                        }`}
                      >
                        {notif.message}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="flex items-center gap-1 text-[10px] text-ink-subtle">
                          <Clock size={10} aria-hidden />
                          {new Date(notif.createdAt).toLocaleDateString(
                            "en-PK",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </span>
                        {notif.link && (
                          <span className="ml-auto flex items-center gap-0.5 text-[10px] font-semibold text-brand-gold-hover">
                            View Details <ChevronRight size={10} aria-hidden />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </motion.li>
            ))}

            {/* Load More */}
            {page < totalPages && (
              <li className="pt-4 text-center">
                <Button
                  variant="outline"
                  size="md"
                  loading={loading}
                  onClick={handleLoadMore}
                >
                  {loading ? "Loading..." : "Load More"}
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
