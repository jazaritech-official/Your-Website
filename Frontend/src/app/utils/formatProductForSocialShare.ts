/**
 * Reusable product-sharing formatter.
 *
 * Generates a clean, human-readable product message that is equally valid when
 * pasted into WhatsApp, Facebook, or Instagram. Both the "Copy for WhatsApp"
 * and "Share on WhatsApp" buttons in the Admin panel consume this single
 * function — no duplicate message-generation logic.
 *
 * Safety:
 *  - Only includes customer-shareable information (no DB IDs, internal
 *    timestamps, audit fields, or secrets).
 *  - Every optional field is guarded against undefined / null / empty values.
 *  - Hashtags are sanitized to be valid on Instagram, Facebook & WhatsApp.
 */

const SITE_URL = "https://irhasinn.vercel.app";

/** Minimal product shape used by this formatter — mirrors the admin
 *  Product interface without coupling to it. */
export interface SocialShareProduct {
  _id?: string;
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  category?: string | { _id: string; name?: string; slug?: string };
  subcategory?: string | { _id: string; name?: string; slug?: string } | null;
  brand?: string;
  colors?: string[];
  sizes?: string[];
  tags?: string[];
  averageRating?: number;
  freeShipping?: boolean;
  shippingCharge?: number;
  customizable?: boolean;
  images?: Array<{ url: string; public_id: string; alt?: string }>;
}

/* ── Hashtag helpers ──────────────────────────────────────────── */

/**
 * Clean a single tag string into a valid social-media hashtag.
 *
 * Rules (Instagram / Facebook / WhatsApp compatible):
 *  - No spaces or punctuation inside a tag
 *  - No leading "#" (we add it later)
 *  - No "##" in the final output
 *  - First letter capitalised for readability (#Watch, not #watch)
 */
function cleanHashtag(raw: string): string {
  return raw
    .replace(/^#+/, "") // strip any leading "#" the admin already typed
    .replace(/[^a-zA-Z0-9]/g, "") // drop spaces, punctuation, special chars
    .trim();
}

/**
 * Convert an array of product tags into a ready-to-paste hashtag block.
 * De-dupes case-insensitively and caps at 10 hashtags (Instagram safe).
 */
export function buildHashtags(tags: string[] | undefined): string {
  if (!tags || !Array.isArray(tags) || tags.length === 0) return "";

  const seen = new Set<string>();
  const hashtags: string[] = [];

  for (const raw of tags) {
    const cleaned = cleanHashtag(raw);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Capitalize first letter for readability: "menswatch" → "Menswatch"
    const tag = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    hashtags.push(`#${tag}`);
    if (hashtags.length >= 10) break;
  }

  return hashtags.join(" ");
}

/* ── Extract human-readable category / subcategory names ─────── */

function resolveCategoryName(
  category: string | { _id: string; name?: string; slug?: string } | undefined,
): string {
  if (!category) return "";
  if (typeof category === "object" && category.name) return category.name;
  return "";
}

function resolveSubcategoryName(
  subcategory:
    | string
    | { _id: string; name?: string; slug?: string }
    | null
    | undefined,
): string {
  if (!subcategory) return "";
  if (typeof subcategory === "object" && subcategory.name)
    return subcategory.name;
  return "";
}

/* ── Main formatter ──────────────────────────────────────────── */

export function formatProductForSocialShare(product: SocialShareProduct): string {
  const lines: string[] = [];

  /* ── Product Name ──────────────────────────────────────────── */
  if (product.name?.trim()) {
    lines.push(product.name.trim());
  }

  /* ── Description ───────────────────────────────────────────── */
  if (product.description?.trim()) {
    lines.push("");
    lines.push(product.description.trim());
  }

  /* ── Price ─────────────────────────────────────────────────── */
  lines.push("");
  lines.push(`💰 Price: Rs ${product.price}`);

  // NOTE: The current Product schema has no discount/salePrice/originalPrice
  // fields. If they are added in the future, display them here.

  /* ── Brand ─────────────────────────────────────────────────── */
  if (product.brand?.trim()) {
    lines.push(`🏷️ Brand: ${product.brand.trim()}`);
  }

  /* ── Colors ────────────────────────────────────────────────── */
  if (Array.isArray(product.colors) && product.colors.length > 0) {
    lines.push("");
    lines.push("🎨 Colors:");
    for (const color of product.colors) {
      if (color?.trim()) lines.push(`• ${color.trim()}`);
    }
  }

  /* ── Sizes ─────────────────────────────────────────────────── */
  if (Array.isArray(product.sizes) && product.sizes.length > 0) {
    lines.push("");
    lines.push("📏 Available Sizes:");
    for (const size of product.sizes) {
      if (size?.trim()) lines.push(`• ${size.trim()}`);
    }
  }

  /* ── Category & Subcategory ────────────────────────────────── */
  const catName = resolveCategoryName(product.category);
  const subName = resolveSubcategoryName(product.subcategory);
  if (catName || subName) {
    lines.push("");
    const parts = [catName, subName].filter(Boolean);
    lines.push(`📦 Category: ${parts.join(" → ")}`);
  }

  /* ── Stock / Availability ──────────────────────────────────── */
  if (typeof product.stock === "number") {
    lines.push("");
    if (product.stock > 0) {
      lines.push(`✅ In Stock (${product.stock} available)`);
    } else {
      lines.push("❌ Out of Stock");
    }
  }

  /* ── Shipping ──────────────────────────────────────────────── */
  if (product.freeShipping) {
    lines.push("🚚 Free Shipping");
  } else if (
    typeof product.shippingCharge === "number" &&
    product.shippingCharge > 0
  ) {
    lines.push(`🚚 Shipping: Rs ${product.shippingCharge}`);
  }

  /* ── Customizable note ─────────────────────────────────────── */
  if (product.customizable) {
    lines.push("");
    lines.push("✨ This product is customizable!");
  }

  /* ── Rating ────────────────────────────────────────────────── */
  if (typeof product.averageRating === "number" && product.averageRating > 0) {
    lines.push("");
    lines.push(
      `⭐ Customer Rating: ${product.averageRating.toFixed(1)} / 5`,
    );
  }

  /* ── Direct Product URL ────────────────────────────────────── */
  if (product._id) {
    const productUrl = `${SITE_URL}/product/${product._id}`;
    lines.push("");
    lines.push("🔗 Order / View Product:");
    lines.push(productUrl);
  }

  /* ── Hashtags ──────────────────────────────────────────────── */
  const hashtags = buildHashtags(product.tags);
  if (hashtags) {
    lines.push("");
    lines.push(hashtags);
  }

  return lines.join("\n");
}
