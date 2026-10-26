"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState } from "@/app/Redux/store";
import { useSocket } from "@/app/utils/PusherSocketProvider";
import { baseUrl, showToast, cloudinaryUrl } from "@/app/utils/commonFunctions";
import Link from "next/link";
import { playMessageSound } from "@/app/utils/notificationSounds";
import {
  MessageSquare,
  Send,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCheck,
  Loader2,
  User,
  Search,
  Trash2,
  ImagePlus,
  X,
} from "lucide-react";

/* ── Module-level conversation cache (admin fast navigation) ──
 * Persists across re-renders + route changes so coming back to this page
 * within the TTL shows the conversation list instantly. Keyed by page number. */
const _convCache: Record<string, { data: any; ts: number }> = {};
const CONV_CACHE_KEY = "admin_chats";
const CONV_CACHE_TTL = 30_000; // 30 seconds

const invalidateConversationsCache = () => {
  Object.keys(_convCache).forEach((k) => {
    if (k.startsWith(CONV_CACHE_KEY)) delete _convCache[k];
  });
};

// Conversation list may include order numbers + unread counts, so the cache is
// keyed per user too — a different admin on the same browser can never see the
// previous admin's cached conversations.
const convCacheId = (username: string, page: number) =>
  `${CONV_CACHE_KEY}:${username}:${page}`;

// List skeleton shown while conversations are loading.
const ConvListSkeleton = () => (
  <div className="animate-pulse space-y-1">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3">
        <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/3 rounded bg-gray-200" />
          <div className="h-2.5 w-1/2 rounded bg-gray-200" />
        </div>
        <div className="h-4 w-10 rounded-full bg-gray-200" />
      </div>
    ))}
  </div>
);

function AdminChatInner() {
  const searchParams = useSearchParams();
  const convParam = searchParams.get("conversation");
  const auth = useSelector((state: RootState) => state.auth);
  const { socket, isConnected, onNewMessage, offNewMessage, onUserTyping, offUserTyping, onMessagesRead, offMessagesRead } = useSocket();

  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedImages, setSelectedImages] = useState<{ id: string; file: File; preview: string }[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [showList, setShowList] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalConversations, setTotalConversations] = useState(0);
  const CONVERSATIONS_PER_PAGE = 20;
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const isSuperAdmin = auth.role === "superadmin";

  // Label for a conversation: order chats show the order number, product
  // chats show the product name, everything else is general support.
  const convLabel = (conv: any) => {
    if (conv?.orderId)
      return `Order #${conv.orderId.serialNumber || conv.orderId._id?.slice(-8) || ""}`;
    if (conv?.productId)
      return conv.productId.name || "Product Chat";
    return "General Support";
  };

  // Conversation context type — drives the badge + context card in the UI.
  const convType = (conv: any): "order" | "product" | "general" => {
    if (conv?.orderId) return "order";
    if (conv?.productId) return "product";
    return "general";
  };

  // Admin links for context cards — orders are managed inline on the
  // Admin Orders page (no separate detail route).
  const orderLink = (conv: any) =>
    `/Admin/Orders`;
  const productLink = (conv: any) =>
    conv?.productId?._id ? `/product/${conv.productId._id}` : null;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!auth.username) return;

    // Serve from module cache when fresh — no network call on back-navigation.
    const cacheId = convCacheId(auth.username, currentPage);
    const cached = _convCache[cacheId];
    if (cached && Date.now() - cached.ts < CONV_CACHE_TTL) {
      setConversations(cached.data.convs);
      setTotalPages(cached.data.totalPages);
      setTotalConversations(cached.data.total);
      return cached.data.convs;
    }

    try {
      const res = await axios.get(
        `${baseUrl}chat/conversations?page=${currentPage}&limit=${CONVERSATIONS_PER_PAGE}`,
        { withCredentials: true }
      );
      const payload = res.data?.data;
      const convs = Array.isArray(payload) ? payload : payload?.conversations ?? [];
      const totalPages = payload?.pagination?.totalPages ?? 1;
      const total = payload?.pagination?.total ?? 0;
      setConversations(convs);
      setTotalPages(totalPages);
      setTotalConversations(total);
      _convCache[cacheId] = {
        data: { convs, totalPages, total },
        ts: Date.now(),
      };
      return convs;
    } catch {
      return [];
    }
  }, [auth.username, currentPage]);

  useEffect(() => {
    if (!auth.username) return;
    const init = async () => {
      setLoading(true);
      const convs = await fetchConversations();
      setLoading(false);

      // Deep-link via ?conversation= param
      if (convParam && convs?.length) {
        const match = convs.find((c: any) => c._id === convParam);
        if (match) {
          setActiveConv(match);
          setShowList(false);
        } else {
          // Try fetching the conversation directly
          try {
            const res = await axios.get(`${baseUrl}chat/conversations/${convParam}`, {
              withCredentials: true,
            });
            const conv = res.data?.data;
            if (conv) {
              setActiveConv(conv);
              setShowList(false);
              setConversations((prev) => {
                const exists = prev.find((c) => c._id === conv._id);
                return exists ? prev : [conv, ...prev];
              });
            }
          } catch (err) { console.error("[silent-catch page.tsx]", err); }
        }
      }
    };
    init();
  }, [auth.username, convParam, fetchConversations]);

  // Fetch messages on active conversation change
  useEffect(() => {
    if (!activeConv?._id) return;
    const fetchMessages = async () => {
      try {
        const res = await axios.get(
          `${baseUrl}chat/conversations/${activeConv._id}/messages?page=1&limit=50`,
          { withCredentials: true }
        );
        const data = res.data?.data || {};
        setMessages(data.messages || []);
        scrollToBottom();
      } catch {
        showToast("Failed to load messages", "error");
      }
    };
    fetchMessages();
  }, [activeConv?._id, scrollToBottom]);

  // Join room
  useEffect(() => {
    if (!socket || !activeConv?._id) return;
    socket.emit("join_conversation", { conversationId: activeConv._id });
  }, [socket, activeConv?._id]);

  // Rejoin on reconnect
  useEffect(() => {
    if (!socket || !activeConv?._id) return;
    const handleReconnect = () => {
      socket.emit("join_conversation", { conversationId: activeConv._id });
    };
    socket.on("connect", handleReconnect);
    return () => {
      socket.off("connect", handleReconnect);
    };
  }, [socket, activeConv?._id]);

  // Socket listeners (callback-ref)
  useEffect(() => {
    const handleNewMessage = (message: any) => {
      if (message.conversationId === activeConv?._id) {
        // Only play sound for messages from OTHER users, not our own
        const isFromSelf = message.senderId?._id === auth._id || message.senderId === auth._id;
        if (!isFromSelf) playMessageSound();
        // Dedupe by message _id (guards against double-delivery when the
        // same-process broadcast AND the Redis bridge both fire)
        setMessages((prev) =>
          prev.some((m) => m._id === message._id) ? prev : [...prev, message]
        );
        scrollToBottom();
      }
      setConversations((prev) =>
        prev.map((c) =>
          c._id === message.conversationId
            ? { ...c, lastMessage: message.type === "image" ? "Image" : message.text, lastMessageAt: message.createdAt }
            : c
        )
      );
      // The list preview changed — drop the cached snapshot so a back-
      // navigation shows the latest lastMessage/unread badge.
      invalidateConversationsCache();
    };

    const handleTyping = (data: any) => {
      if (data.conversationId === activeConv?._id && data.userId !== auth._id) {
        setTypingUsers((prev) => new Set(prev).add(data.userId));
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingUsers(new Set()), 3000);
      }
    };

    const handleRead = (data: any) => {
      if (data.conversationId === activeConv?._id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId?._id !== auth._id && !m.readAt
              ? { ...m, readAt: new Date().toISOString() }
              : m
          )
        );
      }
    };

    onNewMessage(handleNewMessage);
    onUserTyping(handleTyping);
    onMessagesRead(handleRead);

    return () => {
      offNewMessage(handleNewMessage);
      offUserTyping(handleTyping);
      offMessagesRead(handleRead);
    };
  }, [activeConv?._id, auth._id, onNewMessage, offNewMessage, onUserTyping, offUserTyping, onMessagesRead, offMessagesRead, scrollToBottom]);

  const sendText = async (text: string) => {
    if (!text.trim() || !activeConv?._id || sending) return;
    const trimmed = text.trim();
    setSending(true);
    try {
      // OPTIMISTIC UI: show the bubble instantly on the sender's screen,
      // then reconcile with the server-confirmed copy when the REST
      // response lands. Roll back with an error indicator if the send fails.
      // Recipients receive the message via Pusher (server broadcasts after
      // DB save), so they see it near-instantly too.
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const optimistic: any = {
        _id: tempId,
        text: trimmed,
        type: "text",
        senderId: { _id: auth._id, username: auth.username },
        senderRole: auth.role || "admin",
        createdAt: new Date().toISOString(),
        status: "sending",
      };
      setMessages((prev) => [...prev, optimistic]);
      setConversations((prev) =>
        prev.map((c) =>
          c._id === activeConv._id
            ? { ...c, lastMessage: trimmed, lastMessageAt: new Date().toISOString() }
            : c
        )
      );
      invalidateConversationsCache();
      setMessageText("");
      scrollToBottom();
      try {
        const res = await axios.post(
          `${baseUrl}chat/messages`,
          { conversationId: activeConv._id, text: trimmed },
          { withCredentials: true }
        );
        const msg = res.data?.data;
        if (msg) {
          // Reconcile: replace the optimistic bubble with the confirmed copy
          setMessages((prev) => {
            const replaced = prev.map((m) => (m._id === tempId ? msg : m));
            return replaced.filter(
              (m, i) =>
                m._id !== msg._id ||
                replaced.findIndex((x) => x._id === msg._id) === i
            );
          });
        }
      } catch (err: any) {
        // Rollback with an error indicator
        setMessages((prev) =>
          prev.map((m) => (m._id === tempId ? { ...m, status: "error" } : m))
        );
        throw err;
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to send", "error");
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    sendText(messageText);
  };

  // Select image attachments (JPG/JPEG/PNG/WEBP, max 5 MB each, multiple allowed)
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    const valid: { id: string; file: File; preview: string }[] = [];
    for (const file of files) {
      if (!allowed.includes(file.type)) {
        showToast(`${file.name}: only JPG, JPEG, PNG, or WEBP images are allowed`, "error");
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast(`${file.name}: image must be 5 MB or smaller`, "error");
        continue;
      }
      valid.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        preview: URL.createObjectURL(file),
      });
    }
    if (valid.length > 0) {
      setSelectedImages((prev) => [...prev, ...valid]);
    }
    e.target.value = "";
  };

  const removeSelectedImage = (id: string) => {
    setSelectedImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((i) => i.id !== id);
    });
  };

  // Upload + send all selected images — each image becomes its own
  // separate image message in the conversation (one upload request each).
  const sendImages = async () => {
    if (selectedImages.length === 0 || !activeConv?._id || uploadingImages) return;
    setUploadingImages(true);
    const sent: { msg: any; file: File }[] = [];
    try {
      for (const { file } of selectedImages) {
        const formData = new FormData();
        formData.append("conversationId", activeConv._id);
        formData.append("file", file);
        const res = await axios.post(`${baseUrl}chat/messages/image`, formData, {
          withCredentials: true,
        });
        const msg = res.data?.data;
        if (msg) sent.push({ msg, file });
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to upload image(s)", "error");
    } finally {
      // Even on a partial failure, append every image that uploaded successfully
      // so the conversation updates immediately (no page refresh needed).
      if (sent.length > 0) {
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m._id));
          return [...prev, ...sent.map((s) => s.msg).filter((m) => !existing.has(m._id))];
        });
        setConversations((prev) =>
          prev.map((c) =>
            c._id === activeConv._id
              ? { ...c, lastMessage: "Image", lastMessageAt: new Date().toISOString() }
              : c
          )
        );
      }
      // Remove only the images that were successfully sent; keep failures for retry
      setSelectedImages((prev) => {
        const sentFiles = new Set(sent.map((s) => s.file));
        const remaining = prev.filter((i) => !sentFiles.has(i.file));
        prev.forEach((i) => {
          if (sentFiles.has(i.file)) URL.revokeObjectURL(i.preview);
        });
        return remaining;
      });
      setUploadingImages(false);
      scrollToBottom();
    }
  };

  // Emit typing — debounced to fire at most once per 3 seconds
  // to stay within Pusher rate limits and avoid spamming recipients.
  const lastTypingEmitRef = useRef<number>(0);
  const handleTypingEmit = () => {
    const now = Date.now();
    if (socket && activeConv?._id && now - lastTypingEmitRef.current > 3000) {
      lastTypingEmitRef.current = now;
      socket.emit("typing", { conversationId: activeConv._id });
    }
  };

  const handleDeleteConversation = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${baseUrl}chat/conversations/${deleteTarget._id}`, {
        withCredentials: true,
      });
      setConversations((prev) => prev.filter((c) => c._id !== deleteTarget._id));
      invalidateConversationsCache();
      // If the deleted conversation was open, clear the message view
      if (activeConv?._id === deleteTarget._id) {
        setActiveConv(null);
        setMessages([]);
        setShowList(true);
      }
      setDeleteTarget(null);
      // Drop it from any bulk selection if it was checked
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget._id);
        return next;
      });
      showToast("Conversation deleted", "success");
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to delete conversation",
        "error"
      );
    } finally {
      setDeleting(false);
    }
  };

  // ── Bulk selection helpers (superadmin only) ──
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = filteredConversations.every((c) => next.has(c._id));
      if (allSelected) {
        filteredConversations.forEach((c) => next.delete(c._id));
      } else {
        filteredConversations.forEach((c) => next.add(c._id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      await axios.delete(`${baseUrl}chat/conversations/bulk`, {
        data: { conversationIds: ids },
        withCredentials: true,
      });
      const deletedSet = new Set(ids);
      setConversations((prev) => prev.filter((c) => !deletedSet.has(c._id)));
      invalidateConversationsCache();
      // If the currently-open conversation was deleted, clear the message view
      if (activeConv && deletedSet.has(activeConv._id)) {
        setActiveConv(null);
        setMessages([]);
        setShowList(true);
      }
      setSelectedIds(new Set());
      setBulkConfirmOpen(false);
      showToast(
        `${ids.length} conversation${ids.length > 1 ? "s" : ""} deleted`,
        "success"
      );
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to delete conversations",
        "error"
      );
    } finally {
      setDeleting(false);
    }
  };

  const markAsRead = useCallback(() => {
    if (socket && activeConv?._id) {
      socket.emit("mark_read", { conversationId: activeConv._id });
    }
  }, [socket, activeConv?._id]);

  useEffect(() => {
    if (activeConv?._id) markAsRead();
  }, [activeConv?._id, markAsRead]);

  // ── Image lightbox (click any chat image to zoom + navigate) ──
  const imageMessages = messages.filter((m) => m.type === "image" || m.imageUrl);

  const openLightbox = (msgId: string) => {
    const idx = imageMessages.findIndex((m) => m._id === msgId);
    setLightboxIndex(idx >= 0 ? idx : 0);
  };
  const closeLightbox = () => setLightboxIndex(null);
  const prevLightbox = () =>
    setLightboxIndex((i) =>
      i === null ? null : (i - 1 + imageMessages.length) % imageMessages.length
    );
  const nextLightbox = () =>
    setLightboxIndex((i) => (i === null ? null : (i + 1) % imageMessages.length));

  // Keyboard: Esc closes, arrows navigate
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prevLightbox();
      if (e.key === "ArrowRight") nextLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, imageMessages.length]);

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const serial = c.orderId?.serialNumber?.toString() || "";
    const orderId = c.orderId?._id?.slice(-8) || "";
    const customer = c.customerId?.username || c.customerId?.email || "";
    return serial.includes(q) || orderId.includes(q) || customer.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Conversation List */}
      <div className={`${showList ? "w-full" : "hidden"} md:w-80 md:block border-r border-slate-100 flex-shrink-0 flex flex-col`}>
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={16} className="text-slate-500" />
            <h2 className="text-sm font-bold text-slate-900">All Conversations</h2>
            <span className={`ml-auto w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-400"}`} />
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order or customer..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-[#0856DF]"
            />
          </div>
          {/* Select All — superadmin only */}
          {isSuperAdmin && filteredConversations.length > 0 && (
            <label className="mt-2 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={filteredConversations.every((c) => selectedIds.has(c._id))}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]"
              />
              <span className="text-[11px] font-medium text-slate-500">Select all</span>
            </label>
          )}
        </div>
        {/* Bulk action bar — superadmin only */}
        {isSuperAdmin && selectedIds.size > 0 && (
          <div className="flex items-center justify-between border-b border-slate-100 bg-[#0856DF]/5 px-4 py-2">
            <span className="text-xs font-semibold text-[#0856DF]">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => setBulkConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 active:scale-95"
            >
              <Trash2 size={12} />
              Delete Selected
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading && conversations.length === 0 ? (
            <ConvListSkeleton />
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageSquare size={32} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-500">No conversations</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv._id}
                onClick={() => { setActiveConv(conv); setShowList(false); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveConv(conv);
                    setShowList(false);
                  }
                }}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors hover:bg-slate-50 cursor-pointer ${
                  activeConv?._id === conv._id ? "bg-[#0856DF]/5 border-l-2 border-l-[#0856DF]" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Checkbox — superadmin only */}
                    {isSuperAdmin && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(conv._id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelect(conv._id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select conversation"
                        className="h-3.5 w-3.5 flex-shrink-0 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]"
                      />
                    )}
                    <div className="w-6 h-6 rounded-full bg-[#0856DF]/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-[8px] font-bold text-[#0856DF]">
                        {(conv.customerId?.username || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {conv.customerId?.username || conv.customerId?.email || "Customer"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {conv.unreadCountForAdmin > 0 && (
                      <span className="h-5 min-w-5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-1">
                        {conv.unreadCountForAdmin}
                      </span>
                    )}
                    {isSuperAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(conv); }}
                        aria-label="Delete conversation"
                        title="Delete conversation (superadmin)"
                        className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pl-8 mt-0.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                      convType(conv) === "order"
                        ? "bg-blue-50 text-blue-600"
                        : convType(conv) === "product"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {convType(conv)}
                  </span>
                  <p className="text-[10px] text-slate-400 truncate">
                    {convLabel(conv)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
            <p className="text-[11px] text-gray-500">
              {((currentPage - 1) * CONVERSATIONS_PER_PAGE) + 1}–
              {Math.min(currentPage * CONVERSATIONS_PER_PAGE, totalConversations)}{" "}
              of {totalConversations}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#C8A84E] hover:text-[#C8A84E] transition-colors"
              >
                ← Prev
              </button>
              <span className="text-[11px] text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#C8A84E] hover:text-[#C8A84E] transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Message Thread */}
      {(!showList || window.innerWidth >= 768) && (
        <div className={`flex-1 flex flex-col ${showList && window.innerWidth < 768 ? "hidden" : ""}`}>
          {activeConv ? (
            <>
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowList(true)} className="md:hidden p-1 -ml-1">
                    <ArrowLeft size={18} className="text-slate-700" />
                  </button>
                  <div className="w-8 h-8 rounded-full bg-[#0856DF]/10 flex items-center justify-center flex-shrink-0">
                    <User size={14} className="text-[#0856DF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {activeConv.customerId?.username || activeConv.customerId?.email || "Customer"}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {convLabel(activeConv)}
                    </p>
                  </div>
                </div>

                {/* Context card: informational only — no order management here */}
                {activeConv.orderId && (
                  <Link
                    href={orderLink(activeConv)}
                    className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-blue-100 bg-white px-3 py-2 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-blue-600">Order chat</p>
                      <p className="text-xs font-bold text-slate-900">
                        #{activeConv.orderId.serialNumber || activeConv.orderId._id?.slice(-8)}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {activeConv.orderId.status} · Rs {activeConv.orderId.totalPrice?.toLocaleString() || ""}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-[10px] font-bold text-blue-600">View Order →</span>
                  </Link>
                )}
                {activeConv.productId && productLink(activeConv) && (
                  <Link
                    href={productLink(activeConv)!}
                    className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-amber-100 bg-white px-3 py-2 transition-colors hover:border-amber-200 hover:bg-amber-50/40"
                  >
                    <img
                      src={cloudinaryUrl(activeConv.productId.images?.[0]?.url, 80) || "/carousel/Clothes.jpg"}
                      alt={activeConv.productId.name || "Product"}
                      className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600">Product chat</p>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {activeConv.productId.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Rs {activeConv.productId.price?.toLocaleString() || ""}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-[10px] font-bold text-amber-600">View Product →</span>
                  </Link>
                )}
              </div>

              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {/* Contextual system intro — visually distinct from messages */}
                {messages.length === 0 && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-500">
                      {convType(activeConv) === "order"
                        ? `Started a conversation about Order #${activeConv.orderId?.serialNumber || ""}`
                        : convType(activeConv) === "product"
                        ? `Started a conversation about ${activeConv.productId?.name || "this product"}`
                        : "General support conversation"}
                    </span>
                  </div>
                )}
                {messages.map((msg, idx) => {
                  const isMine = msg.senderId?._id === auth._id || msg.senderId === auth._id;
                  const isAdminMsg = msg.senderRole === "admin" || msg.senderRole === "superadmin";
                  return (
                    <div key={msg._id || idx} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                        isMine
                          ? "bg-[#0856DF] text-white rounded-br-md"
                          : isAdminMsg
                            ? "bg-slate-100 text-slate-900 rounded-bl-md"
                            : "bg-gray-50 text-slate-900 rounded-bl-md border border-slate-200"
                      }`}>
                        {!isMine && (
                          <p className="text-[10px] font-semibold mb-1 opacity-70">
                            {isAdminMsg ? "Store" : "Customer"}
                          </p>
                        )}
                        {msg.type === "image" || msg.imageUrl ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openLightbox(msg._id)}
                              aria-label="View image"
                              className="block p-0 border-0 bg-transparent cursor-pointer"
                            >
                              <img
                                src={msg.imageUrl}
                                alt="Chat image"
                                className="max-w-full max-h-64 rounded-xl object-cover"
                              />
                            </button>
                            {msg.text ? (
                              <p className="text-sm leading-relaxed mt-1.5">{msg.text}</p>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-sm leading-relaxed">{msg.text}</p>
                        )}
                        <div className={`flex items-center gap-1.5 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
                          <span className={`text-[10px] ${isMine ? "text-white/70" : "text-slate-400"}`}>
                            {formatTime(msg.createdAt)}
                          </span>
                          {isMine && msg.readAt && (
                            <CheckCheck size={12} className={isMine ? "text-white/70" : "text-[#C8A84E]"} />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {typingUsers.size > 0 && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-4 py-3 border-t border-slate-100">
                {/* Image previews */}
                {selectedImages.length > 0 && (
                  <div className="mb-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="flex flex-wrap gap-2">
                      {selectedImages.map((img) => (
                        <div key={img.id} className="relative">
                          <img
                            src={img.preview}
                            alt="Image preview"
                            className="h-14 w-14 rounded-lg object-cover"
                          />
                          <button
                            onClick={() => removeSelectedImage(img.id)}
                            disabled={uploadingImages}
                            aria-label="Remove image"
                            className="absolute -top-1.5 -right-1.5 rounded-full bg-slate-900/70 text-white p-0.5 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-slate-500">
                        {selectedImages.length} image{selectedImages.length !== 1 ? "s" : ""} selected
                      </span>
                      <button
                        onClick={sendImages}
                        disabled={uploadingImages}
                        className="flex-shrink-0 rounded-lg bg-[#0856DF] px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:bg-[#0645c8] active:scale-95 disabled:opacity-50"
                      >
                        {uploadingImages ? "Uploading…" : `Send ${selectedImages.length} image${selectedImages.length !== 1 ? "s" : ""}`}
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || uploadingImages}
                    aria-label="Attach image"
                    className="flex-shrink-0 h-10 w-10 rounded-xl border border-slate-200 text-slate-500 flex items-center justify-center transition-all hover:border-[#0856DF] hover:text-[#0856DF] active:scale-95 disabled:opacity-50"
                  >
                    <ImagePlus size={16} />
                  </button>
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                      handleTypingEmit();
                    }}
                    placeholder="Reply as Store..."
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/10 transition-all"
                    disabled={sending || uploadingImages}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!messageText.trim() || sending || uploadingImages}
                    className="flex-shrink-0 h-10 w-10 rounded-xl bg-[#0856DF] text-white flex items-center justify-center hover:bg-[#0645c8] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare size={48} className="mx-auto text-slate-200 mb-4" />
                <p className="text-sm font-semibold text-slate-500">Select a conversation</p>
                <p className="text-xs text-slate-400 mt-1">Choose a customer chat to start replying</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Conversation Confirmation — superadmin only */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <Trash2 size={22} className="text-red-600" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-900">Delete Conversation?</h3>
            <p className="mb-6 text-sm font-medium text-slate-500">
              Are you sure you want to delete this conversation? This cannot be
              undone. All messages will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConversation}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation — superadmin only */}
      {bulkConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <Trash2 size={22} className="text-red-600" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-900">
              Delete {selectedIds.size} Conversation{selectedIds.size !== 1 ? "s" : ""}?
            </h3>
            <p className="mb-6 text-sm font-medium text-slate-500">
              Are you sure you want to delete these {selectedIds.size} conversations? This
              cannot be undone. All messages will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setBulkConfirmOpen(false)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxIndex !== null && imageMessages[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            aria-label="Close preview"
            className="absolute top-4 right-4 rounded-full bg-white/10 text-white p-2 hover:bg-white/20 transition-colors"
          >
            <X size={20} />
          </button>
          {imageMessages.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prevLightbox(); }}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 text-white p-2.5 hover:bg-white/20 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <img
            src={imageMessages[lightboxIndex].imageUrl}
            alt="Chat image preview"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
          />
          {imageMessages.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); nextLightbox(); }}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 text-white p-2.5 hover:bg-white/20 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          )}
          {imageMessages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
              {lightboxIndex + 1} / {imageMessages.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminChatsPage() {
  return (
    <div className="h-full">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Chats</h1>
        <p className="text-sm text-slate-500">Customer conversations and support messages</p>
      </div>
      <AdminChatInner />
    </div>
  );
}
