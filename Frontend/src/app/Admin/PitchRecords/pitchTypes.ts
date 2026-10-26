/**
 * Admin-side types + label maps for Pitch Records.
 * Mirror the backend projections in
 * `Backend/Controllers/pitchRecordController.js` (toAdminShape)
 * and the whitelists in `Backend/Models/PitchRecord.js` —
 * keep in sync when extending either side.
 */

export interface PitchRecord {
  id: string;
  clientName: string;
  pitchTitle: string;
  industry: string;
  status: string;
  showcaseProfile: string | null;
  profileSlug: string;
  profileNameSnapshot: string;
  selectedPreset: string;
  configVersion: number | null;
  configuredInterfaces: string[];
  demonstratedFeatures: string[];
  customizationSummary: string;
  /** PRIVATE — only ever present on authenticated admin responses. */
  internalNotes: string;
  outcomeNotes: string;
  presentedAt: string | null;
  followUpAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Internal sales workflow — mirrors backend PITCH_STATUSES. */
export const PITCH_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  preparing: "Preparing",
  ready: "Ready",
  presented: "Presented",
  followup: "Follow-up",
  won: "Won",
  lost: "Lost",
  archived: "Archived",
};

export const PITCH_STATUS_TONE: Record<
  string,
  "emerald" | "red" | "amber" | "blue" | "slate" | "violet"
> = {
  draft: "slate",
  preparing: "amber",
  ready: "blue",
  presented: "violet",
  followup: "amber",
  won: "emerald",
  lost: "red",
  archived: "slate",
};

/** Mirrors backend PITCH_INTERFACES — human labels for the editor. */
export const INTERFACE_LABELS: Record<string, string> = {
  homepage: "Homepage",
  "header-logo": "Header logo",
  "theme-colors": "Theme colours",
  typography: "Typography",
  hero: "Hero",
  "category-presentation": "Category presentation",
  "featured-products": "Featured products",
  "product-detail": "Product detail",
  footer: "Footer",
  "contact-info": "Contact info",
  "social-links": "Social links",
  "seo-metadata": "SEO metadata",
};

/** Mirrors backend PITCH_FEATURES — human labels for the editor. */
export const FEATURE_LABELS: Record<string, string> = {
  "industry-presets": "Industry presets",
  "ai-brand-suggestions": "AI brand suggestions",
  "theme-editor": "Theme editor",
  "logo-upload": "Logo upload",
  "hero-config": "Hero configuration",
  "section-ordering": "Section ordering",
  "product-ordering": "Product ordering",
  "storefront-preview": "Storefront preview",
  "purchase-flow": "Purchase flow",
  "order-tracking": "Order tracking",
  "rider-delivery": "Rider delivery",
  "referral-wallet": "Referral wallet",
};
