"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState } from "@/app/Redux/store";
import { useSocket } from "@/app/utils/PusherSocketProvider";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import {
  Users as UsersIcon,
  LayoutList,
  LayoutGrid,
  MessageSquare,
  Loader2,
  Radio,
  Wifi,
  WifiOff,
} from "lucide-react";

interface OnlineUser {
  _id: string;
  username: string;
  email: string;
  profilePic?: string;
  role?: "user" | "admin" | "superadmin";
  /** True for ids seen online via socket whose profile hasn't loaded yet. */
  loading?: boolean;
}

const RoleBadge = ({ role }: { role?: string }) => {
  if (role === "superadmin")
    return (
      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
        Super Admin
      </span>
    );
  if (role === "admin")
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
        Admin
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
      Customer
    </span>
  );
};

const Avatar = ({ user, size = "md" }: { user: OnlineUser; size?: "md" | "lg" }) => {
  const cls =
    size === "lg"
      ? "h-14 w-14 rounded-2xl text-lg"
      : "h-10 w-10 rounded-full text-sm";
  if (user.profilePic) {
    return (
      <img
        src={user.profilePic}
        alt={user.username}
        className={`${cls} flex-shrink-0 border border-slate-200 bg-slate-100 object-cover`}
      />
    );
  }
  return (
    <div
      className={`${cls} flex flex-shrink-0 items-center justify-center bg-gradient-to-br from-[#C8A84E] to-[#B8943F] font-bold text-white shadow-sm`}
    >
      {(user.username || "?").charAt(0).toUpperCase()}
    </div>
  );
};

const OnlineDot = () => (
  <span className="relative flex h-2.5 w-2.5">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
  </span>
);

export default function OnlineUsersPage() {
  const router = useRouter();
  const auth = useSelector((state: RootState) => state.auth);
  const { socket, isConnected } = useSocket();

  /**
   * Presence is a hybrid of two sources:
   *  - `onlineIds` (Set | null): LIVE presence from the socket — the admin's
   *    own browser receives presence_snapshot / presence_update directly from
   *    the WebSocket Function, so the visible list is correct even when the
   *    REST endpoint's presence store is cold or Redis is not configured.
   *    null = no socket presence data yet (fall back to REST snapshot).
   *  - `profiles` / `restUsers`: profile data fetched from the REST endpoint.
   */
  const [onlineIds, setOnlineIds] = useState<Set<string> | null>(null);
  const [restUsers, setRestUsers] = useState<OnlineUser[]>([]);
  const [profiles, setProfiles] = useState<Record<string, OnlineUser>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [chattingId, setChattingId] = useState<string | null>(null);

  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchOnlineUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await axios.get(`${baseUrl}admin/online-users`, {
        withCredentials: true,
      });
      const list = res.data?.data || [];
      setRestUsers(list);
      // Merge into the profile cache so socket-driven rows resolve quickly
      setProfiles((prev) => {
        const next = { ...prev };
        list.forEach((u: OnlineUser) => {
          if (u?._id) next[u._id] = u;
        });
        return next;
      });
      setLastUpdated(new Date());
    } catch {
      /* keep last known list on transient errors */
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Debounced refetch triggered by real-time socket presence events
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => fetchOnlineUsers(true), 400);
  }, [fetchOnlineUsers]);

  // Initial load — live presence updates arrive via the socket subscription
  // below (snapshot + presence events, which also trigger the debounced
  // REST refresh). No polling.
  useEffect(() => {
    fetchOnlineUsers();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [fetchOnlineUsers]);

  // Real-time presence via socket: join admin room, apply snapshot/updates
  useEffect(() => {
    if (!socket) return;
    const onConnect = () => socket.emit("join_admin_room");
    const onDisconnect = () => setOnlineIds(null); // fall back to REST list
    const onSnapshot = (data: any) => {
      setOnlineIds(new Set(data?.userIds || []));
      // The snapshot carries full profiles (username/email/profilePic/role)
      // so rows resolve immediately — even when the REST presence endpoint
      // returns empty (separate serverless instance without Redis).
      if (Array.isArray(data?.users)) {
        setProfiles((prev) => {
          const next = { ...prev };
          data.users.forEach((u: any) => {
            if (u?._id) next[u._id] = u;
          });
          return next;
        });
      }
      scheduleRefresh();
    };
    const onPresenceUpdate = (data: any) => {
      if (data?.userId) {
        setOnlineIds((prev) => {
          const next = new Set(prev ?? []);
          if (data.online) next.add(data.userId);
          else next.delete(data.userId);
          return next;
        });
        // Merge the profile carried by the presence event (only on connect,
        // so we never cache a profile for an id that just went offline)
        if (data.online && data?.user?._id) {
          setProfiles((prev) => ({ ...prev, [data.user._id]: data.user }));
        }
      }
      scheduleRefresh();
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("presence_snapshot", onSnapshot);
    socket.on("presence_update", onPresenceUpdate);
    socket.emit("join_admin_room");
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("presence_snapshot", onSnapshot);
      socket.off("presence_update", onPresenceUpdate);
    };
  }, [socket, scheduleRefresh]);

  // Visible list: socket presence wins when available, else REST snapshot
  const displayUsers = useMemo<OnlineUser[]>(() => {
    if (onlineIds === null) return restUsers;
    return Array.from(onlineIds).map((id) =>
      profiles[id] ?? { _id: id, username: "Loading…", email: "", loading: true }
    );
  }, [onlineIds, profiles, restUsers]);

  const handleChat = async (user: OnlineUser) => {
    if (!user?._id || chattingId) return;
    setChattingId(user._id);
    try {
      const res = await axios.post(
        `${baseUrl}chat/start-direct`,
        { targetUserId: user._id },
        { withCredentials: true }
      );
      const conversationId = res.data?.data?.conversationId;
      if (conversationId) {
        router.push(`/Admin/Chats?conversation=${conversationId}`);
      } else {
        showToast("Could not start conversation", "error");
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to start chat",
        "error"
      );
    } finally {
      setChattingId(null);
    }
  };

  const isSelf = (user: OnlineUser) => user._id === auth._id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Online Users
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Customers and staff currently connected in real-time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700">
            <OnlineDot />
            {displayUsers.length} online
          </span>
          <span
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold ${
              isConnected
                ? "border-slate-200 bg-white text-slate-600"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {isConnected ? (
              <Wifi size={15} className="text-emerald-500" />
            ) : (
              <WifiOff size={15} />
            )}
            {isConnected ? "Live" : "Polling"}
          </span>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              onClick={() => setView("list")}
              aria-label="List view"
              className={`rounded-lg p-2 transition-all ${
                view === "list"
                  ? "bg-[#0856DF] text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <LayoutList size={16} />
            </button>
            <button
              onClick={() => setView("grid")}
              aria-label="Grid view"
              className={`rounded-lg p-2 transition-all ${
                view === "grid"
                  ? "bg-[#0856DF] text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      {loading && displayUsers.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-24">
          <div className="text-center">
            <Loader2 size={28} className="mx-auto animate-spin text-[#C8A84E]" />
            <p className="mt-3 text-sm font-medium text-slate-500">
              Detecting online users…
            </p>
          </div>
        </div>
      ) : displayUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-20 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Radio size={24} className="text-slate-400" />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-600">
            No users online right now
          </p>
          <p className="mt-1 text-xs text-slate-400">
            When a customer opens the store (or any page), they&apos;ll appear
            here automatically.
          </p>
          <button
            onClick={() => fetchOnlineUsers()}
            className="mt-5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Refresh now
          </button>
        </div>
      ) : view === "list" ? (
        /* ── List view ── */
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {displayUsers.length} user{displayUsers.length !== 1 ? "s" : ""} connected
            </p>
            {lastUpdated && (
              <p className="text-[11px] text-slate-400">
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {displayUsers.map((user) => (
              <li
                key={user._id}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
              >
                <div className="relative flex-shrink-0">
                  <Avatar user={user} />
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <OnlineDot />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {user.loading ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-400">
                        <Loader2 size={13} className="animate-spin" />
                        Loading…
                      </span>
                    ) : (
                      <p className="truncate text-sm font-bold text-slate-900">
                        {user.username}
                      </p>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {user.email || "Fetching profile…"}
                  </p>
                </div>
                <div className="hidden md:block">
                  <RoleBadge role={user.role} />
                </div>
                {!isSelf(user) ? (
                  <button
                    onClick={() => handleChat(user)}
                    disabled={chattingId === user._id || !!chattingId}
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-[#0856DF] px-3.5 py-2 text-xs font-semibold text-white transition-all hover:bg-[#0645c8] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {chattingId === user._id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <MessageSquare size={13} />
                    )}
                    Chat
                  </button>
                ) : (
                  <span className="flex-shrink-0 text-[11px] font-medium text-slate-300">
                    You
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        /* ── Grid view ── */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayUsers.map((user) => (
            <div
              key={user._id}
              className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#C8A84E]/40 hover:shadow-md"
            >
              <div className="absolute right-4 top-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 ring-1 ring-inset ring-emerald-600/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Online
                </span>
              </div>
              <div className="flex flex-col items-center pt-3 text-center">
                <div className="relative">
                  <Avatar user={user} size="lg" />
                </div>
                {user.loading ? (
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-slate-400">
                    <Loader2 size={13} className="animate-spin" />
                    Loading…
                  </span>
                ) : (
                  <p className="mt-3 w-full truncate text-sm font-bold text-slate-900">
                    {user.username}
                  </p>
                )}
                <p className="mt-0.5 w-full truncate text-xs text-slate-500">
                  {user.email || "Fetching profile…"}
                </p>
                <div className="mt-3">
                  <RoleBadge role={user.role} />
                </div>
                {!isSelf(user) ? (
                  <button
                    onClick={() => handleChat(user)}
                    disabled={chattingId === user._id || !!chattingId}
                    className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0856DF] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[#0645c8] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {chattingId === user._id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <MessageSquare size={13} />
                    )}
                    Start Chat
                  </button>
                ) : (
                  <span className="mt-4 text-[11px] font-medium text-slate-300">
                    This is you
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <UsersIcon size={12} />
          Presence via live socket
        </p>
      </div>
    </div>
  );
}
