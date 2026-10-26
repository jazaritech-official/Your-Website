"use client";
import { formatPKR } from "@/app/utils/format";
import { useState, useEffect, useRef } from "react";
import { MessageSquare, Bot, Send, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import axios from "axios";
import { showToast, cloudinaryUrl, baseUrl } from "../utils/commonFunctions";

type ChatMessage = {
  role: "user" | "ai";
  content: string;
  product?: any;
  products?: any[];
  viewAll?: boolean;
  query?: string;
};


export default function AIProductChat() {
  const pathname = usePathname();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages]);

  // Storefront marketing widget — never show it inside the Admin panel or
  // the dedicated rider shell (rider sees only its own minimal UI).
  // Declared AFTER all hooks so the hook order is stable across renders.
  if (pathname?.startsWith("/Admin") || pathname?.startsWith("/rider")) return null;

  const sendQuery = async (queryText: string) => {
    if (!queryText.trim()) return;
    const userMsg: ChatMessage = { role: "user", content: queryText.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post(
        `${baseUrl}product/ai/search-products`, // Fixed endpoint path
        { query: userMsg.content },
        {
          withCredentials: true,
          headers: { "Content-Type": "application/json" },
        }
      );

      const json = res.data;

      if (json?.data?.intent?.isProductQuery === false) {
        const aiMsg: ChatMessage = { role: "ai", content: json.data.message || json.message };
        setMessages((prev) => [...prev, aiMsg]);
      } else if (json?.data?.products?.length === 1) {
        const product = json.data.products[0];
        const aiMsg: ChatMessage = { role: "ai", content: `Found a match for you:`, product };
        setMessages((prev) => [...prev, aiMsg]);
      } else if (json?.data?.products?.length > 1) {
        const products = json.data.products.slice(0, 5);
        const aiMsg: ChatMessage = {
          role: "ai",
          content: `Found ${json.data.count || products.length} products matching "${userMsg.content}":`,
          products,
          query: userMsg.content,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const aiMsg: ChatMessage = { role: "ai", content: "No products found." };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err: any) {
      const aiMsg: ChatMessage = { role: "ai", content: "Sorry, something went wrong. Please try again later." };
      setMessages((prev) => [...prev, aiMsg]);
      showToast(
        err?.response?.data?.message || "Error connecting to AI search",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendQuery(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickReplies = ["Show me jackets", "New arrivals", "Best sellers"];

  return (
    <>
      {/* Floating Trigger Button — clean, no pulse/funky animation */}
      <button
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold text-white shadow-md hover:shadow-lg hover:bg-brand-gold transition-all duration-200"
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Open AI chat"
      >
        <MessageSquare size={22} />
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex justify-end">
          <div
            className="w-[calc(100vw-3rem)] max-w-sm sm:max-w-md origin-bottom-right transition-all duration-200 ease-out"
            style={{ animation: "chatPopIn 200ms ease-out" }}
          >
            <div className="flex flex-col w-full h-[70vh] max-h-[560px] bg-surface rounded-2xl border border-line shadow-xl overflow-hidden">
              {/* Header — clean, single brand color, no gradient */}
              <div className="flex items-center gap-2 px-4 py-3 bg-brand-gold text-white">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface/10">
                  <Bot size={16} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm leading-tight">Shop Assistant</h3>
                  <p className="text-[11px] text-white/60 leading-tight">Online</p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-md hover:bg-surface/10 transition-colors"
                  aria-label="Close chat"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface">
                {messages.length === 0 && (
                  <div className="text-center text-brand-navy mt-6">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/10">
                      <Bot size={22} className="text-brand-navy" />
                    </div>
                    <p className="text-sm font-medium text-brand-navy">
                      Hi! How can I help you find something today?
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      {quickReplies.map((txt, i) => (
                        <button
                          key={i}
                          onClick={() => sendQuery(txt)}
                          className="px-3 py-1.5 bg-surface border border-line text-brand-navy rounded-full text-xs font-medium hover:border-brand-gold hover:text-brand-gold transition-colors"
                        >
                          {txt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === "user"
                          ? "bg-brand-gold text-white rounded-br-sm"
                          : "bg-surface text-brand-navy border border-line rounded-bl-sm"
                        }`}
                    >
                      {msg.content}
                      {/* Multiple product cards — horizontal scroll */}
                      {msg.products && msg.products.length > 0 && (
                        <div className="mt-2.5 -mx-1 overflow-x-auto">
                          <div className="flex gap-2 px-1 pb-1">
                            {msg.products.map((p: any) => (
                              <button
                                key={p._id}
                                onClick={() => {
                                  router.push(`/product/${p._id}`);
                                }}
                                className="shrink-0 w-[130px] rounded-lg border border-line bg-surface overflow-hidden text-left hover:border-brand-gold hover:shadow-sm transition-all duration-150"
                              >
                                <img
                                  src={cloudinaryUrl(p.images?.[0]?.url, 300) || "/carousel/Clothes.jpg"}
                                  alt={p.name}
                                  className="h-[72px] w-full object-cover"
                                />
                                <div className="p-2">
                                  <p className="text-[11px] font-semibold text-brand-navy leading-tight truncate">{p.name}</p>
                                  <p className="text-[10px] font-bold text-brand-gold mt-0.5">{formatPKR(p.price)}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                          {msg.query && (
                            <button
                              onClick={() => {
                                router.push(`/ai-search?q=${encodeURIComponent(msg.query!)}`);
                              }}
                              className="mt-1.5 text-[11px] font-medium text-brand-gold hover:underline"
                            >
                              View all results →
                            </button>
                          )}
                        </div>
                      )}
                      {/* Single product card */}
                      {msg.product && (
                        <button
                          onClick={() => router.push(`/product/${msg.product._id}`)}
                          className="mt-2 w-full p-2 border border-line rounded-lg bg-surface text-left hover:border-brand-gold hover:shadow-sm transition-all duration-150"
                        >
                          <img
                            src={cloudinaryUrl(msg.product.images?.[0]?.url, 300) || "/carousel/Clothes.jpg"}
                            alt={msg.product.name}
                            className="h-20 w-20 object-cover rounded-md"
                          />
                          <p className="font-medium mt-1.5 text-brand-navy text-sm">{msg.product.name}</p>
                          <p className="text-sm text-brand-gold font-bold">{formatPKR(msg.product.price)}</p>
                          <span className="mt-1 inline-block text-xs font-medium text-brand-navy hover:underline">
                            View Product →
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-surface border border-line rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-bounce"></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-line p-3 flex items-center gap-2 bg-surface">
                <input
                  className="flex-1 rounded-full border border-line px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                  placeholder="Ask about products..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="flex h-9 w-9 items-center justify-center bg-brand-gold hover:bg-brand-gold text-white rounded-full disabled:opacity-40 transition-colors"
                  aria-label="Send message"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes chatPopIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  );
}