"use client";
import { formatPKR } from "@/app/utils/format";

import { memo, useMemo } from "react";
import { BadgeCheck, Upload, X } from "lucide-react";
import {
  cloudinaryUrl,
  getVariantOptions,
  getVariantStock,
  hasVariantInventory,
  resolveItemPrice,
} from "@/app/utils/commonFunctions";
import { getFieldKey } from "@/app/utils/customizationPreview";
import type { PrintLayout } from "@/app/utils/printLayout";
import LiveCustomPreview from "@/app/Components/LiveCustomPreview";
import QuantityStepper from "@/app/Components/QuantityStepper";

/* ============================================================
   CheckoutItemCard — one cart line, presented as ONE unit
   ------------------------------------------------------------
   Previously the product thumbnail, title, variant selects,
   customization form, quantity and remove action were spread
   across several visually unrelated blocks inside the order
   summary column. This card groups them so a customized item
   reads as a single product: preview → identity → variant →
   customization → quantity/price/actions.

   PRESENTATION ONLY. Every value, handler and guard below is the
   previous checkout markup moved into one component:

   - same `resolveItemPrice` line totals and "Select size" hint
   - same variant selects (onVariantChange)
   - same customization fields, required markers and upload flow
   - same QuantityStepper guards (variant-managed items require a
     chosen size before quantity can change) and same max stock
   - same remove action

   PERFORMANCE: wrapped in React.memo, so typing in the shipping
   form (parent state) no longer re-renders this subtree — which
   importantly means the LiveCustomPreview canvases stop
   re-rendering on every keystroke.
   ============================================================ */

export interface CheckoutCartItem {
  /** Product id — the identity used for order creation. */
  _id: string;
  /**
   * Per-LINE address (product + variant + customization). Two lines may share
   * a product id once the same product is customized differently, so quantity,
   * remove and the per-line customization state must key off `lineKey`.
   */
  lineKey: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  stock?: number;
  images?: Array<{ url: string }>;
  selectedColor?: string;
  selectedSize?: string;
  colors?: string[];
  sizes?: string[];
  addedBy?: string;
  freeShipping?: boolean;
  shippingCharge?: number;
  customizationAnswers?: Array<{ label: string; value: string }>;
  /** Guest carts store the populated category object; the logged-in cart API
      returns only the category id (resolved by the page). */
  category?: { _id?: string; name?: string } | string;
  customizable?: boolean;
  showCustomizationPreview?: boolean;
  customizationFields?: Array<{
    fieldType: string;
    label: string;
    required: boolean;
  }>;
  printLayout?: PrintLayout | null;
  variantPricing?: Record<string, number>;
  variantStock?: Record<string, number>;
  product?: {
    _id?: string;
    name?: string;
    customizable?: boolean;
    showCustomizationPreview?: boolean;
    customizationFields?: Array<{
      fieldType: string;
      label: string;
      required: boolean;
    }>;
    images?: Array<{ url: string }>;
    freeShipping?: boolean;
    printLayout?: PrintLayout | null;
  } | null;
}

export interface CheckoutItemCardProps {
  item: CheckoutCartItem;
  /** Resolved category display name (empty string = not available). */
  categoryName?: string;
  /** Keyed maps for THIS item only (key = `${fieldType}|${label}`). */
  answers?: Record<string, string>;
  previews?: Record<string, string>;
  files?: Record<string, File | null>;
  removeBg?: Record<string, boolean>;
  onVariantChange: (
    itemId: string,
    field: "selectedColor" | "selectedSize",
    value: string,
  ) => void;
  onCustomizationChange: (itemId: string, key: string, value: string) => void;
  onCustomizationFileChange: (
    itemId: string,
    key: string,
    file: File | null,
  ) => void;
  onToggleRemoveBackground: (itemId: string, key: string) => void;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}

const FALLBACK_IMAGE = "/carousel/Clothes.jpg";

const CheckoutItemCard = memo(function CheckoutItemCard({
  item,
  categoryName,
  answers,
  previews,
  files,
  removeBg,
  onVariantChange,
  onCustomizationChange,
  onCustomizationFileChange,
  onToggleRemoveBackground,
  onQuantityChange,
  onRemove,
}: CheckoutItemCardProps) {
  const fields = useMemo(
    () => item.customizationFields || [],
    [item.customizationFields],
  );
  const colorOptions = useMemo(
    () => getVariantOptions(item.colors),
    [item.colors],
  );
  const sizeOptions = useMemo(() => getVariantOptions(item.sizes), [item.sizes]);

  const itemAnswers = answers || {};
  const itemPreviews = previews || {};
  const itemFiles = files || {};

  const unitPrice = resolveItemPrice(item);
  const variantManaged = hasVariantInventory(item);
  /** Variant stock requires a chosen size first — same guard as before. */
  const needsSize = variantManaged && !item.selectedSize;
  const maxQuantity = variantManaged
    ? item.selectedSize
      ? getVariantStock(item, item.selectedColor, item.selectedSize) || undefined
      : undefined
    : item.stock ?? undefined;

  const isCustomizable = item.customizable === true && fields.length > 0;
  const hasRequired = fields.some((f) => f.required);
  const hasCustomization =
    item.customizable === true &&
    (Object.values(itemAnswers).some(Boolean) ||
      Object.values(itemPreviews).some(Boolean));

  /** Required fields still unanswered — drives the live "N required" chip. */
  const missingRequiredCount = useMemo(
    () =>
      fields.filter((field) => {
        if (!field.required) return false;
        const key = getFieldKey(field.fieldType, field.label);
        if (field.fieldType === "image") {
          return !files?.[key] && !previews?.[key];
        }
        return !(answers?.[key] || "").trim();
      }).length,
    [fields, answers, previews, files],
  );

  const rawImage = item.images?.[0]?.url;
  const productImage = rawImage || FALLBACK_IMAGE;
  const thumbnailSrc = cloudinaryUrl(rawImage, 300) || FALLBACK_IMAGE;
  const printLayout = item.printLayout ?? item.product?.printLayout ?? null;

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(34,40,49,0.05)]">
      {/* Brand hairline — static, zero animation cost per row. */}
      <div className="h-[3px] w-full bg-gradient-to-r from-brand-gold via-brand-gold/40 to-brand-navy" />

      <div className="p-4 sm:p-5">
        {/* ── Identity: preview · name · price ── */}
        <div className="flex gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-muted ring-1 ring-line sm:h-24 sm:w-24">
            {hasCustomization ? (
              <LiveCustomPreview
                productImage={productImage}
                fields={fields}
                answers={itemAnswers}
                images={itemPreviews}
                printLayout={printLayout}
                removeBackground={removeBg}
                showEmptyHint={false}
                fit="cover"
                className="h-full w-full"
              />
            ) : (
              <img
                src={thumbnailSrc}
                alt={item.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="line-clamp-2 min-w-0 flex-1 text-sm font-bold leading-snug text-brand-navy sm:text-[15px]">
                {item.name}
              </h3>
              <span className="shrink-0 text-sm font-bold tabular-nums text-brand-navy sm:text-base">
                {needsSize && unitPrice === 0 ? (
                  <span className="text-xs font-semibold text-ink-muted">
                    Select size
                  </span>
                ) : (
                  `${formatPKR((unitPrice * item.quantity))}`
                )}
              </span>
            </div>

            {categoryName && (
              <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
                {categoryName}
              </p>
            )}

            {(item.quantity > 1 && unitPrice > 0) ||
            item.selectedColor ||
            item.selectedSize ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-ink-muted">
                {item.quantity > 1 && unitPrice > 0 && (
                  <span>
                    {item.quantity} &times; {formatPKR(unitPrice)}
                  </span>
                )}
                {item.selectedColor && <span>Color: {item.selectedColor}</span>}
                {item.selectedSize && <span>Size: {item.selectedSize}</span>}
              </div>
            ) : null}

            {isCustomizable && (
              <span
                className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  hasCustomization
                    ? "bg-brand-gold/20 text-brand-gold-strong"
                    : "bg-surface-muted text-ink-muted"
                }`}
              >
                <BadgeCheck size={11} />
                {hasCustomization ? "Personalized" : "Customizable"}
              </span>
            )}

            {/* ── Variant selection ── */}
            {(colorOptions.length > 0 || sizeOptions.length > 0) && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {colorOptions.length > 0 && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                      Color
                    </span>
                    <select
                      value={item.selectedColor || ""}
                      onChange={(e) =>
                        onVariantChange(item.lineKey, "selectedColor", e.target.value)
                      }
                      className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-brand-navy outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/15"
                    >
                      <option value="" disabled>
                        Select color
                      </option>
                      {colorOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {sizeOptions.length > 0 && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                      Size
                    </span>
                    <select
                      value={item.selectedSize || ""}
                      onChange={(e) =>
                        onVariantChange(item.lineKey, "selectedSize", e.target.value)
                      }
                      className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-brand-navy outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/15"
                    >
                      <option value="" disabled>
                        Select size
                      </option>
                      {sizeOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Customization: preview + fields grouped as one panel ── */}
        {isCustomizable && (
          <section className="mt-4 rounded-xl border border-brand-gold/25 bg-[#FCFAF4] p-3.5 sm:p-4">
            <header className="mb-1.5 flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand-navy/60">
                {hasRequired ? "Customization required" : "Your customization"}
              </p>
              {missingRequiredCount > 0 ? (
                <span className="rounded-full bg-[#C14444]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-state-danger">
                  {missingRequiredCount} required
                </span>
              ) : hasRequired ? (
                <span className="rounded-full bg-brand-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-gold-strong">
                  Required
                </span>
              ) : null}
            </header>
            <p className="mb-3 text-[11px] font-medium text-ink-muted">
              Personalise this item — we&apos;ll print exactly what you provide
              here.
            </p>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
              <div className="mx-auto w-full max-w-[210px] sm:mx-0 sm:max-w-none">
                {(item.showCustomizationPreview ?? true) ? (
                  <LiveCustomPreview
                    productImage={productImage}
                    fields={fields}
                    answers={itemAnswers}
                    images={itemPreviews}
                    printLayout={printLayout}
                    showEmptyHint
                    removeBackground={removeBg}
                  />
                ) : (
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-surface-muted sm:rounded-2xl">
                    <img
                      src={productImage}
                      alt={item.name}
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {fields.map((field, idx) => {
                  const key = getFieldKey(field.fieldType, field.label);
                  const value = itemAnswers[key] || "";
                  const file = itemFiles[key] || null;
                  const preview = itemPreviews[key] || "";
                  const missingRequired =
                    !!field.required &&
                    (field.fieldType === "image"
                      ? !file && !preview
                      : !value.trim());
                  return (
                    <div key={`${key}-${idx}`}>
                      <label
                        className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-navy/70"
                        htmlFor={`customization-${item.lineKey}-${idx}`}
                      >
                        <span>{field.label}</span>
                        {field.required && (
                          <span className="text-state-danger" aria-hidden="true">
                            *
                          </span>
                        )}
                        {field.required && (
                          <span className="rounded bg-brand-gold/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-gold-strong">
                            Required
                          </span>
                        )}
                      </label>

                      {field.fieldType === "text" && (
                        <input
                          id={`customization-${item.lineKey}-${idx}`}
                          type="text"
                          value={value}
                          onChange={(e) =>
                            onCustomizationChange(item.lineKey, key, e.target.value)
                          }
                          className={`min-h-11 w-full rounded-lg border bg-surface px-3.5 py-2.5 text-xs font-medium outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/10 ${
                            missingRequired
                              ? "border-state-danger/50"
                              : "border-line"
                          }`}
                          placeholder={`Your ${field.label.toLowerCase()} here`}
                        />
                      )}

                      {field.fieldType === "textarea" && (
                        <textarea
                          id={`customization-${item.lineKey}-${idx}`}
                          value={value}
                          onChange={(e) =>
                            onCustomizationChange(item.lineKey, key, e.target.value)
                          }
                          rows={3}
                          className={`min-h-11 w-full resize-none rounded-lg border bg-surface px-3.5 py-2.5 text-xs font-medium outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/10 ${
                            missingRequired
                              ? "border-state-danger/50"
                              : "border-line"
                          }`}
                          placeholder={`Your ${field.label.toLowerCase()} here`}
                        />
                      )}

                      {field.fieldType === "image" && (
                        <div>
                          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#D8D8D8] bg-surface px-3 py-2.5 text-xs font-semibold text-brand-navy/70 transition hover:border-brand-gold hover:bg-brand-gold/5">
                            <Upload size={14} />
                            <span>{file ? "Change image" : "Upload your design"}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) =>
                                onCustomizationFileChange(
                                  item.lineKey,
                                  key,
                                  e.target.files?.[0] || null,
                                )
                              }
                              className="hidden"
                            />
                          </label>
                          {preview && (
                            <div className="mt-2 inline-flex items-center gap-2.5 rounded-xl border border-line bg-surface p-1.5 pl-2">
                              <img
                                src={preview}
                                alt="Uploaded design"
                                className="h-9 w-9 rounded-lg object-cover ring-1 ring-gray-200"
                              />
                              <div className="flex flex-col">
                                <span className="text-[10px] font-medium text-ink-muted">
                                  Uploaded
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCustomizationFileChange(item.lineKey, key, null)
                                  }
                                  className="text-left text-[10px] font-semibold text-brand-gold-strong transition-colors hover:text-brand-gold"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          )}
                          {preview && (
                            <label className="mt-2 flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-brand-navy transition hover:border-brand-gold/40 hover:bg-brand-gold/5">
                              <input
                                type="checkbox"
                                checked={!!removeBg?.[key]}
                                onChange={() =>
                                  onToggleRemoveBackground(item.lineKey, key)
                                }
                                className="h-4 w-4 accent-brand-gold"
                              />
                              Remove background
                            </label>
                          )}
                        </div>
                      )}

                      {missingRequired && (
                        <p className="mt-1 text-[10px] font-semibold text-state-danger">
                          This field is required
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── Quantity · remove ── */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <QuantityStepper
              quantity={item.quantity}
              onDecrease={() => {
                if (needsSize) return;
                onQuantityChange(item.lineKey, Math.max(1, item.quantity - 1));
              }}
              onIncrease={() => {
                if (needsSize) return;
                onQuantityChange(item.lineKey, item.quantity + 1);
              }}
              max={maxQuantity}
              onQuantityChange={(qty) => {
                if (needsSize) return;
                onQuantityChange(item.lineKey, qty);
              }}
            />
            {needsSize && (
              <span className="text-[11px] font-semibold text-state-danger">
                Select a size first
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.lineKey)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted transition hover:bg-red-50 hover:text-state-danger"
          >
            <X size={12} /> Remove
          </button>
        </div>
      </div>
    </article>
  );
});

export default CheckoutItemCard;
