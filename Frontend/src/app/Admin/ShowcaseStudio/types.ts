/**
 * Admin-side types for the Showcase Studio.
 * Mirror the backend projections in
 * `Backend/Controllers/brandProfileController.js` (toAdminShape /
 * resolvePublicConfig) — keep in sync when extending either side.
 */

export interface StudioCta {
  label: string;
  href: string;
}

export interface StudioSection {
  id: string;
  type: string;
  visible: boolean;
  variant: string;
  heading: string;
  subtitle: string;
  image: string;
  imageMobile: string;
  ctaLabel: string;
  ctaHref: string;
  categoryIds: string[];
  productIds: string[];
}

export interface StudioConfig {
  brandName: string;
  tagline: string;
  logoUrl: string;
  logoPublicId: string;
  faviconUrl: string;
  faviconPublicId: string;
  seoTitle: string;
  seoDescription: string;
  /** Public indexing control — false (default) renders noindex,nofollow. */
  seoIndexable: boolean;
  industry: string;
  theme: {
    colors: Record<string, string>;
    typography: string;
  };
  hero: {
    image: string;
    imageMobile: string;
    heading: string;
    subheading: string;
    primaryCta: StudioCta;
    secondaryCta: StudioCta;
  };
  sections: StudioSection[];
  categoryOrder: string[];
  contact: {
    address: string;
    phone: string;
    email: string;
    whatsapp: string;
    social: Record<string, string>;
  };
  footer: {
    description: string;
    poweredBy: boolean;
  };
  previewWatermark: boolean;
  watermarkText: string;
}

export interface StudioVersion {
  version: number;
  note: string;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface ShowcaseProfile {
  id: string;
  name: string;
  slug: string;
  clientName: string;
  industry: string;
  // F-09: the legacy "preview" status was removed — drafts are previewed
  // through the authenticated preview-config endpoint instead.
  status: "draft" | "published" | "archived";
  config: StudioConfig;
  hasPublishedConfig: boolean;
  publishedAt: string | null;
  versions: StudioVersion[];
  nextVersion: number;
  createdAt: string;
  updatedAt: string;
}

export const STATUS_TONE: Record<string, "emerald" | "amber" | "blue" | "slate"> = {
  published: "emerald",
  draft: "amber",
  archived: "slate",
};

export const STATUS_LABEL: Record<string, string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};
