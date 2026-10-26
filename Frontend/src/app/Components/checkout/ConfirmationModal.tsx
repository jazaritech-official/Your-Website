"use client";
import { formatPKR } from "@/app/utils/format";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Download, X, MessageCircle, Loader2 } from "lucide-react";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
// html2canvas is dynamically imported where used (line ~81) to reduce bundle size

/* ===========================================================
   ORDER CONFIRMATION MODAL
   Shown after successful order creation. Contains:
   - Success animation
   - Order ID
   - Invoice image preview (HTML-rendered)
   - Download Invoice as PNG image (client-side via html2canvas)
   - Continue Shopping / Chat buttons
   =========================================================== */

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  selectedColor?: string;
  selectedSize?: string;
  productImage?: string;
}

interface ConfirmationModalProps {
  open: boolean;
  orderId: string | null;
  serialNumber?: number | null;
  items: OrderItem[];
  itemsPrice: number;
  shippingPrice: number;
  discountAmount?: number;
  totalPrice: number;
  paymentMethod: string;
  shippingAddress: {
    fullName: string;
    city: string;
    country: string;
  };
  onClose: () => void;
  onContinueShopping: () => void;
  onChat?: () => void;
}

const fmtPKR = (n: number) => `${formatPKR(Number(n || 0))}`;

/** Invoice preview/download appears for orders where any item qty >= 10. */
const BULK_ORDER_THRESHOLD = 10;

/* ------------------------------------------------------------------
   Tailwind v4 outputs oklch()/oklab() color values internally.
   html2canvas (v1.4.1) cannot parse these and throws:
     "Attempting to parse an unsupported color function 'oklab'"

   Fix: (a) render the invoice with inline hex/rgba styles so
            html2canvas never sees a Tailwind-generated color, and
         (b) in the onclone callback, strip any residual Tailwind
             color utility classes from the cloned invoice DOM.
   ------------------------------------------------------------------ */
const STRIP_COLOR_RE =
  /^bg-\[|\bbg-\w|^text-\[|\btext-\w|^border-\[|\bborder-\w|^divide-\w|^ring-\w|^shadow-\w|^from-\w|^to-\w|^via-\w|^placeholder-\w|^accent-\w|^caret-\w|^decoration-\w|^outline-\w|^fill-\w|^stroke-\w/;

/** Recursively strip Tailwind color-related classes from every element
 *  inside `root` so html2canvas only encounters inline hex/rgba colors. */
function stripTailwindColors(root: Element) {
  const walk = (el: Element) => {
    if (el instanceof HTMLElement || el instanceof SVGElement) {
      el.classList.forEach((cls) => {
        if (STRIP_COLOR_RE.test(cls)) el.classList.remove(cls);
      });
    }
    Array.from(el.children).forEach(walk);
  };
  walk(root);
}

export default function ConfirmationModal({
  open,
  orderId,
  serialNumber,
  items,
  itemsPrice,
  shippingPrice,
  discountAmount = 0,
  totalPrice,
  paymentMethod,
  shippingAddress,
  onClose,
  onContinueShopping,
  onChat,
}: ConfirmationModalProps) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  // Bulk = at least one ordered item at or above the quantity threshold.
  // Normal orders get no invoice UI and never touch the invoice endpoint.
  const isBulkOrder =
    Array.isArray(items) &&
    items.some((item) => item.quantity >= BULK_ORDER_THRESHOLD);

  const handleDownloadInvoice = async () => {
    if (!invoiceRef.current || downloading) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        backgroundColor: "#FAFAF8",
        useCORS: true,
        logging: false,
        onclone: (doc: Document) => {
          /* Strip Tailwind color-utility classes from the invoice AND
             every ancestor up to <body>. html2canvas walks the full
             DOM tree; Tailwind v4 compiles colors to oklch/oklab which
             html2canvas cannot parse. Inline hex/rgba styles on the
             invoice elements keep the visual appearance intact. */
          const el = doc.getElementById('invoice-capture');
          if (el) {
            stripTailwindColors(el);
            let ancestor: Element | null = el.parentElement;
            while (ancestor && ancestor !== doc.body) {
              stripTailwindColors(ancestor);
              ancestor = ancestor.parentElement;
            }
          }
        },
      });
      const link = document.createElement("a");
      link.download = `IrhasInn-Invoice-${serialNumber || orderId || "order"}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Invoice image capture failed:", err);
      showToast("Failed to generate invoice image. Please try again.", "error");
    } finally {
      setDownloading(false);
    }
  };

  const orderDate = new Date().toLocaleDateString("en-PK", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
            style={{ backgroundColor: '#ffffff' }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 rounded-full p-2 transition hover:text-brand-navy"
              style={{ color: 'rgba(34,40,49,0.4)' }}
            >
              <X size={18} />
            </button>

            {/* Success header */}
            <div className="px-6 pt-8 pb-6 text-center">
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-gold shadow-lg shadow-brand-gold/25"
              >
                <CheckCircle className="h-8 w-8 text-white" />
              </motion.div>
              <h2 className="text-2xl font-black" style={{ color: '#222831' }}>Order Confirmed</h2>
              <p className="mt-1 text-sm" style={{ color: 'rgba(34,40,49,0.6)' }}>
                Order #{serialNumber || orderId?.slice(-8).toUpperCase()}
              </p>
            </div>

            {/* Invoice preview — BULK ORDERS ONLY: hidden entirely for normal
                orders so they trigger zero invoice rendering/processing. */}
            {isBulkOrder && (
            <div className="px-5 pb-5">
              <div
                ref={invoiceRef}
                id="invoice-capture"
                className="relative rounded-xl p-5 text-xs"
                style={{
                  fontFamily: "system-ui, sans-serif",
                  backgroundColor: '#FAFAF8',
                  border: '1px solid #E8E7E3',
                }}
              >
                {/* Gold accent bar */}
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ backgroundColor: '#C8A84E' }} />

                {/* Invoice header */}
                <div className="mb-4 flex items-center justify-between pb-4" style={{ borderBottom: '1px solid #E8E7E3' }}>
                  <div>
                    <p className="text-lg font-black" style={{ color: '#222831' }}>Irhas&apos;Inn</p>
                    <p className="text-[10px]" style={{ color: 'rgba(34,40,49,0.5)' }}>Premium Quality Delivered</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold" style={{ color: '#222831' }}>INVOICE</p>
                    <p className="text-[10px]" style={{ color: 'rgba(34,40,49,0.5)' }}>{orderDate}</p>
                  </div>
                </div>

                {/* Order & Customer info */}
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: '#C8A84E' }}>
                      Order Details
                    </p>
                    <p className="font-semibold" style={{ color: '#222831' }}>
                      #{serialNumber || orderId?.slice(-8).toUpperCase()}
                    </p>
                    <p style={{ color: 'rgba(34,40,49,0.6)' }}>{paymentMethod}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: '#C8A84E' }}>
                      Ship To
                    </p>
                    <p className="font-semibold" style={{ color: '#222831' }}>
                      {shippingAddress.fullName}
                    </p>
                    <p style={{ color: 'rgba(34,40,49,0.6)' }}>
                      {shippingAddress.city}, {shippingAddress.country}
                    </p>
                  </div>
                </div>

                {/* Items table */}
                <div className="mb-4 overflow-hidden rounded-lg" style={{ border: '1px solid #E8E7E3' }}>
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: '#222831', color: '#ffffff' }}>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-center">Qty</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr
                          key={idx}
                          style={{ borderTop: '1px solid #E8E7E3', backgroundColor: '#ffffff' }}
                        >
                          <td className="px-3 py-2">
                            <p className="font-semibold" style={{ color: '#222831' }}>
                              {item.name}
                            </p>
                            {(item.selectedColor || item.selectedSize) && (
                              <p className="text-[10px]" style={{ color: 'rgba(34,40,49,0.5)' }}>
                                {[item.selectedColor, item.selectedSize]
                                  .filter(Boolean)
                                  .join(" / ")}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center font-medium" style={{ color: '#222831' }}>
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2 text-right" style={{ color: 'rgba(34,40,49,0.7)' }}>
                            {fmtPKR(item.unitPrice)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold" style={{ color: '#222831' }}>
                            {fmtPKR(item.unitPrice * item.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="space-y-1.5 pt-3" style={{ borderTop: '1px solid #E8E7E3' }}>
                  <div className="flex justify-between" style={{ color: 'rgba(34,40,49,0.7)' }}>
                    <span>Subtotal</span>
                    <span className="font-medium">{fmtPKR(itemsPrice)}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: 'rgba(34,40,49,0.7)' }}>
                    <span>Shipping</span>
                    <span className="font-medium">
                      {shippingPrice > 0 ? fmtPKR(shippingPrice) : "Free"}
                    </span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between" style={{ color: '#C8A84E' }}>
                      <span>Discount</span>
                      <span className="font-medium">-{fmtPKR(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 text-sm font-bold" style={{ color: '#222831', borderTop: '1px solid #E8E7E3' }}>
                    <span>Total</span>
                    <span style={{ color: '#C8A84E' }}>{fmtPKR(totalPrice)}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 text-center" style={{ borderTop: '1px solid #E8E7E3' }}>
                  <p className="text-[9px]" style={{ color: 'rgba(34,40,49,0.4)' }}>
                    Thank you for your order! Irhas&apos;Inn — Premium Quality Delivered with Care
                  </p>
                </div>
              </div>
            </div>
            )}

            {/* Actions */}
            <div className={`flex flex-col gap-3 px-5 pb-6 ${isBulkOrder ? "" : "pt-6"}`}>
              {isBulkOrder && (
              <button
                type="button"
                onClick={handleDownloadInvoice}
                disabled={downloading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand-gold bg-surface py-3 text-sm font-bold text-brand-gold transition hover:bg-brand-gold/5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating Image...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Download Invoice Image
                  </>
                )}
              </button>
              )}
              <div className="flex gap-3">
                {onChat && (
                  <button
                    type="button"
                    onClick={onChat}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-gold py-3 text-sm font-bold text-white transition hover:bg-brand-gold-hover"
                  >
                    <MessageCircle size={16} />
                    Chat with us
                  </button>
                )}
                <button
                  type="button"
                  onClick={onContinueShopping}
                  className={`flex items-center justify-center gap-2 rounded-xl border border-[#E8E7E3] bg-surface py-3 text-sm font-bold text-brand-navy transition hover:bg-[#F6F5F1] ${
                    onChat ? "flex-1" : "w-full"
                  }`}
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
