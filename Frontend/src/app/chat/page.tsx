"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState } from "../Redux/store";
import { useSocket } from "../utils/PusherSocketProvider";
import { baseUrl, showToast, cloudinaryUrl, getSizePriceRange } from "../utils/commonFunctions";
import {
  MessageSquare,
  Send,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCheck,
  Loader2,
  ImagePlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { playMessageSound } from "../utils/notificationSounds";
import { Badge, Button, EmptyState, SectionLabel } from "../Components/ui";
import { motion } from "framer-motion";
import { EASE_STANDARD } from "../utils/motion";

const QUICK_MESSAGES = [
  "Where is my order?",
  "Can I change my delivery address?",
  "I want to modify my customization.",
  "When will my order arrive?",
  "I uploaded the wrong image.",
  "I want to talk to support.",
];

function ChatInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderParam = searchParams.get("order");
  const productParam = searchParams.get("product");
  const fromCheckout = searchParams.get("from") === "checkout";
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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Context-aware label: order chats show the order number, product chats
  // show the product name, everything else is general support.
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  // Fetch conversations. The backend returns a plain array for customers but
  // the paginated `{ conversations, pagination }` shape for admin sessions
  // (e.g. an admin browsing the storefront chat). Normalize both to an array
  // so the list never renders `undefined.map` — same guard as Admin/Chats.
  const fetchConversations = useCallback(async () => {
    if (!auth.username) return [];
    try {
      const res = await axios.get(`${baseUrl}chat/conversations`, {
        withCredentials: true,
      });
      const payload = res.data?.data;
      const convs = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.conversations)
        ? payload.conversations
        : [];
      setConversations(convs);
      return convs;
    } catch {
      return [];
    }
  }, [auth.username]);

  // Initial load
  useEffect(() => {
    if (!auth.username) return;
    const init = async () => {
      setLoading(true);
      const convs = await fetchConversations();
      setLoading(false);

      // Deep-link helpers: resolve ?order= / ?product= to a conversation,
      // creating it on demand via the get-or-create endpoint so a second
      // click never spawns a duplicate conversation.
      const openConversation = async (getUrl: string, matchPred: (c: any) => boolean) => {
        const match = convs.find(matchPred);
        if (match) {
          setActiveConv(match);
          setShowList(false);
          return;
        }
        try {
          const res = await axios.get(getUrl, { withCredentials: true });
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
      };

      if (orderParam) {
        await openConversation(
          `${baseUrl}chat/conversations/order/${orderParam}`,
          (c: any) => c.orderId?._id === orderParam || c.orderId === orderParam
        );
      } else if (productParam) {
        await openConversation(
          `${baseUrl}chat/conversations/product/${productParam}`,
          (c: any) => c.productId?._id === productParam || c.productId === productParam
        );
      }
    };
    init();
  }, [auth.username, orderParam, productParam, fetchConversations]);

  // Fetch messages when active conversation changes
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
        setPage(1);
        setHasMore(data.totalPages > 1);
        scrollToBottom();
      } catch {
        showToast("Failed to load messages", "error");
      }
    };
    fetchMessages();
  }, [activeConv?._id, scrollToBottom]);

  // Join conversation room via socket when active conversation changes
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

  // Socket event listeners (callback-ref pattern)
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
      // Update conversation lastMessage (images show a short label)
      setConversations((prev) =>
        prev.map((c) =>
          c._id === message.conversationId
            ? { ...c, lastMessage: message.type === "image" ? "Image" : message.text, lastMessageAt: message.createdAt }
            : c
        )
      );
    };

    const handleTyping = (data: any) => {
      if (data.conversationId === activeConv?._id && data.userId !== auth._id) {
        setTypingUsers((prev) => new Set(prev).add(data.userId));
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          setTypingUsers(new Set());
        }, 3000);
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

  // Send a text message (used by the input AND quick message chips)
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
        senderId: { _id: auth._id },
        senderRole: "customer",
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
          // (kept at the same position). Dedupe against any echoed copy.
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
        // Rollback with an error indicator: keep the bubble, mark it failed
        // so the sender sees the message did not go through.
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

  // Mark as read
  const markAsRead = useCallback(() => {
    if (socket && activeConv?._id) {
      socket.emit("mark_read", { conversationId: activeConv._id });
    }
  }, [socket, activeConv?._id]);

  // Mark messages as read when viewing a conversation
  useEffect(() => {
    if (activeConv?._id) {
      markAsRead();
    }
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

  if (!auth.username) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-page px-4 pb-6 pt-24">
        <EmptyState
          icon={<MessageSquare size={26} />}
          title="Sign in to view your chats"
          description="Chat with our team about orders, products, or anything else."
          action={
            <Link href="/" className="inline-flex items-center gap-2 rounded-field bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-navy-deep transition-colors hover:bg-brand-gold-hover">
              Back to Home
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-surface-page">
      {/* Mobile header */}
      <div className="fixed left-0 right-0 top-0 z-40 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
        {!showList && activeConv ? (
          <button onClick={() => setShowList(true)} className="p-1 -ml-1">
            <ArrowLeft size={20} className="text-ink" />
          </button>
        ) : null}
        <h1 className="text-lg font-bold text-brand-navy">
          {showList ? "My Chats" : convLabel(activeConv)}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <span aria-hidden className={`h-2 w-2 rounded-full ${isConnected ? "bg-state-success" : "bg-state-danger"}`} />
          <span className="text-[10px] text-ink-subtle">{isConnected ? "Live" : "Offline"}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto pt-16 md:pt-24 pb-6 px-4">
        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-between mb-6">
          <div>
            <Link href="/profile" className="text-sm font-semibold text-ink-muted transition-colors hover:text-brand-gold-hover">
              ← Back to Profile
            </Link>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-brand-navy">My Chats</h1>
          </div>
          <div className="flex items-center gap-2">
            <span aria-hidden className={`h-2 w-2 rounded-full ${isConnected ? "bg-state-success" : "bg-state-danger"}`} />
            <span className="text-xs text-ink-muted">{isConnected ? "Connected" : "Reconnecting..."}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="flex h-[600px] md:h-[500px]">
            {/* Conversation List */}
            {(showList || window.innerWidth >= 768) && (
              <div className={`${showList ? "w-full" : "hidden"} md:w-80 md:block border-r border-line flex-shrink-0`}>
                <div className="border-b border-line p-4">
                  <h2 className="text-sm font-bold text-brand-navy">Conversations</h2>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="overflow-y-auto h-[calc(100%-60px)]">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 size={20} className="animate-spin text-ink-subtle" />
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <MessageSquare size={32} className="mx-auto mb-3 text-ink-subtle" />
                      <p className="text-sm font-semibold text-ink-muted">No conversations yet</p>
                      <p className="mt-1 text-xs text-ink-subtle">Place an order to start chatting.</p>
                    </div>
                  ) : (
                    conversations.map((conv) => (
                      <button
                        key={conv._id}
                        onClick={() => {
                          setActiveConv(conv);
                          setShowList(false);
                        }}
                        className={`w-full border-b border-line-soft px-4 py-3.5 text-left transition-colors hover:bg-surface-muted ${
                          activeConv?._id === conv._id ? "border-l-2 border-l-brand-gold bg-brand-gold/[0.06]" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="truncate text-xs font-bold text-brand-navy">
                            {convLabel(conv)}
                          </p>
                          <span className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            <Badge
                              tone={convType(conv) === "order" ? "info" : convType(conv) === "product" ? "warning" : "neutral"}
                              size="sm"
                            >
                              {convType(conv)}
                            </Badge>
                            {conv.unreadCountForCustomer > 0 && (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-gold px-1 text-[8px] font-bold text-white">
                                {conv.unreadCountForCustomer}
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-ink-muted">
                          {conv.lastMessage || "No messages yet"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock size={10} aria-hidden className="text-ink-subtle" />
                          <span className="text-[10px] text-ink-subtle">
                            {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : "Just created"}
                          </span>
                          <ChevronRight size={12} aria-hidden className="ml-auto text-ink-subtle" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Message Thread */}
            {(!showList || window.innerWidth >= 768) && (
              <div className={`flex-1 flex flex-col ${showList && window.innerWidth < 768 ? "hidden" : ""}`}>
                {activeConv ? (
                  <>
                    {/* Thread header + context card */}
                    <div className="border-b border-line bg-surface-muted px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button aria-label="Back to conversations" onClick={() => setShowList(true)} className="p-1 -ml-1 text-ink transition-colors hover:text-brand-gold md:hidden">
                          <ArrowLeft size={18} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-brand-navy">
                            {convLabel(activeConv)}
                          </p>
                          <p className="text-[10px] text-ink-muted">
                            {convType(activeConv) === "order"
                              ? `${activeConv.orderId.status || "Order"} · Rs ${activeConv.orderId.totalPrice?.toLocaleString() || ""}`
                              : convType(activeConv) === "product"
                              ? "Product chat — we know exactly which product you're asking about"
                              : "General support — how can we help?"}
                          </p>
                        </div>
                      </div>

                      {/* Context card: compact, informational, clickable */}
                      {activeConv.orderId && (
                        <Link
                          href={`/profile/orders/${activeConv.orderId._id}`}
                          className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-info/20 bg-surface px-3 py-2 transition-colors hover:border-info/40 hover:bg-info/[0.04]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-info">Order chat</p>
                            <p className="text-xs font-bold text-brand-navy">
                              #{activeConv.orderId.serialNumber || activeConv.orderId._id?.slice(-8)}
                            </p>
                            <p className="truncate text-[10px] text-ink-muted">
                              {activeConv.orderId.status} · Rs {activeConv.orderId.totalPrice?.toLocaleString() || ""}
                            </p>
                          </div>
                          <span className="flex-shrink-0 text-[10px] font-bold text-info">View Order →</span>
                        </Link>
                      )}
                      {activeConv.productId && (
                        <Link
                          href={`/product/${activeConv.productId._id}`}
                          className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-warning/20 bg-surface px-3 py-2 transition-colors hover:border-warning/40 hover:bg-warning/[0.04]"
                        >
                          <img
                            src={
                              cloudinaryUrl(activeConv.productId.images?.[0]?.url, 300) ||
                              "/carousel/Clothes.jpg"
                            }
                            alt={activeConv.productId.name || "Product"}
                            className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-warning">Product chat</p>
                            <p className="truncate text-xs font-bold text-brand-navy">
                              {activeConv.productId.name}
                            </p>
                            <p className="text-[10px] text-ink-muted">
                              Rs {activeConv.productId.price?.toLocaleString() || ""}
                            </p>
                          </div>
                          <span className="flex-shrink-0 text-[10px] font-bold text-warning">View Product →</span>
                        </Link>
                      )}
                    </div>

                    {/* Messages */}
                    <div
                      ref={messagesContainerRef}
                      className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
                    >
                      {/* Contextual system intro */}
                      {messages.length === 0 && (
                        <div className="flex justify-center py-2">
                          <span className="rounded-full bg-surface-muted px-3 py-1 text-[10px] font-semibold text-ink-muted">
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
                        /*
                         * MOTION ONLY — animate the newest message only.
                         * Older messages mount with `initial={false}` so a
                         * conversation's existing history never animates, and
                         * new messages (including real-time Pusher arrivals)
                         * fade/rise in. Capped at one animated node so a long
                         * thread can never trigger a mass entrance animation.
                         */
                        const isNewest = idx === messages.length - 1;
                        return (
                          <motion.div
                            key={msg._id || idx}
                            initial={
                              isNewest
                                ? { opacity: 0, y: 8, scale: 0.98 }
                                : false
                            }
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.24, ease: EASE_STANDARD }}
                            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                                isMine
                                  ? "bg-brand-gold text-brand-navy-deep rounded-br-md"
                                  : "bg-surface text-ink rounded-bl-md border border-line"
                              }`}
                            >
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
                              <div className={`mt-1 flex items-center gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
                                <span className={`text-[10px] ${isMine ? "text-brand-navy-deep/60" : "text-ink-subtle"}`}>
                                  {formatTime(msg.createdAt)}
                                </span>
                                {isMine && msg.readAt && (
                                  <CheckCheck size={12} className={isMine ? "text-brand-navy-deep/60" : "text-brand-gold"} />
                                )}
                                {isMine && msg.status === "sending" && (
                                  <span className="text-[10px] italic text-brand-navy-deep/50">Sending…</span>
                                )}
                                {isMine && msg.status === "error" && (
                                  <span className="text-[10px] font-semibold text-state-danger">Failed to send</span>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                      {typingUsers.size > 0 && (
                        <div className="flex justify-start">
                          <div
                            role="status"
                            aria-label="Support is typing"
                            className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-2.5"
                          >
                            {/* CSS-only dot cycle (ir-typing-dot) — no timers, no state. */}
                            <div className="flex gap-1" aria-hidden="true">
                              <span className="ir-typing-dot h-2 w-2 rounded-full bg-ink-subtle" />
                              <span className="ir-typing-dot h-2 w-2 rounded-full bg-ink-subtle" />
                              <span className="ir-typing-dot h-2 w-2 rounded-full bg-ink-subtle" />
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="border-t border-line px-4 py-3">
                      {/* Quick messages — only when arriving from checkout success */}
                      {fromCheckout && (
                        <div className="mb-2.5">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
                            Quick questions
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {QUICK_MESSAGES.map((q) => (
                              <button
                                key={q}
                                onClick={() => sendText(q)}
                                disabled={sending || uploadingImages}
                                className="rounded-full border border-line bg-surface-muted px-3 py-1.5 text-[11px] font-semibold text-ink transition-all hover:border-brand-gold hover:bg-brand-gold/[0.06] hover:text-brand-gold active:scale-95 disabled:opacity-50"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Image previews */}
                      {selectedImages.length > 0 && (
                        <div className="mb-2.5 rounded-xl border border-line bg-surface-muted p-2">
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
                                  className="absolute -right-1.5 -top-1.5 rounded-full bg-brand-navy-deep/70 p-0.5 text-white transition-colors hover:bg-state-danger disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] text-ink-muted">
                              {selectedImages.length} image{selectedImages.length !== 1 ? "s" : ""} selected
                            </span>
                            <button
                              onClick={sendImages}
                              disabled={uploadingImages}
                              className="flex-shrink-0 rounded-lg bg-brand-gold px-3 py-1.5 text-[11px] font-bold text-brand-navy-deep transition-all hover:bg-brand-gold-hover active:scale-95 disabled:opacity-50"
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
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-line text-ink-muted transition-all hover:border-brand-gold hover:text-brand-gold active:scale-95 disabled:opacity-50"
                        >
                          <ImagePlus size={16} />
                        </button>
                        <input
                          type="text"
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSend();
                            }
                            handleTypingEmit();
                          }}
                          placeholder="Type a message..."
                          className="flex-1 rounded-xl border border-line bg-surface-muted px-4 py-2.5 text-sm text-ink outline-none transition-all focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                          disabled={sending || uploadingImages}
                        />
                        <button
                          onClick={handleSend}
                          disabled={!messageText.trim() || sending || uploadingImages}
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-gold text-brand-navy-deep transition-all hover:bg-brand-gold-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="text-center">
                      <MessageSquare size={48} className="mx-auto mb-4 text-ink-subtle" />
                      <p className="text-sm font-semibold text-ink-muted">Select a conversation</p>
                      <p className="mt-1 text-xs text-ink-subtle">Choose an order to start chatting</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 size={24} className="animate-spin text-brand-gold" /></div>}>
      <ChatInner />
    </Suspense>
  );
}
