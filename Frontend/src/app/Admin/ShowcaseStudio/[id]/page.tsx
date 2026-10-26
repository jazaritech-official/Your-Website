"use client";

/**
 * ============================================================
 * SHOWCASE STUDIO — EDITOR
 * ------------------------------------------------------------
 * Full editor for one brand showcase profile. Every field maps
 * 1:1 to `Backend/utils/showcaseConfig.js` (the canonical
 * sanitizer), so what the operator sees here is exactly what the
 * backend will persist — unknown fields never survive a save.
 *
 * DRAFT vs PUBLISHED
 * Saving only writes the DRAFT. Publishing snapshots the draft
 * into an immutable version and makes it live at /store/[slug].
 * The two lifecycles never cross: the public storefront only
 * ever reads the published copy.
 *
 * CATALOG HONESTY
 * Product/category pickers select REAL shared-catalog records by
 * id. The showcase can only FEATURE catalog items — it can never
 * create or fake them.
 * ============================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import axios from "axios";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  Lock,
  Palette,
  Plus,
  Rocket,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Undo2,
} from "lucide-react";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import { apiErrorMessage } from "@/app/utils/axiosError";
import { formatPKR } from "@/app/utils/format";
import {
  INDUSTRY_PRESETS,
  TYPOGRAPHY_OPTIONS,
  findIndustryPreset,
  type TypographyPresetId,
} from "@/config/industryPresets";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminLoading,
  AdminModal,
  AdminPageHeader,
  AdminSelect,
  AdminTextarea,
  adminCx,
} from "../../components/adminUI";
import {
  STATUS_LABEL,
  STATUS_TONE,
  type ShowcaseProfile,
  type StudioConfig,
  type StudioSection,
} from "../types";
// Pure, unit-tested studio logic (Vitest): section validation mirror of the
// backend rules, preset section-order application, dirty-safe asset merges
// and profile category-strip ordering.
import {
  SECTION_VARIANT_OPTIONS,
  appendCategoryOrder,
  applySuggestedSectionOrder,
  mergeUploadedAsset,
  sectionIssue,
} from "../studioLogic";
import { useProductCatalogOptions } from "../../Products/useProductCatalogOptions";

/* ── local constants (mirror backend registry) ─────────────── */

const TABS = ["brand", "theme", "hero", "sections", "contact", "publish"] as const;
type Tab = (typeof TABS)[number];

/* ── F-03: sanitizer warning shape (mirrors Backend/utils/showcaseConfig.js) ── */
interface SanitizerWarning {
  path: string;
  code: string;
  message: string;
}

const TAB_META: Record<Tab, { label: string; icon: typeof Palette }> = {
  brand: { label: "Brand & SEO", icon: Globe },
  theme: { label: "Theme", icon: Palette },
  hero: { label: "Hero", icon: ImageIcon },
  sections: { label: "Homepage", icon: Layers },
  contact: { label: "Contact & Footer", icon: Link2 },
  publish: { label: "Publish", icon: Rocket },
};

/** Editable colour groups — semantic status tokens are intentionally
 *  excluded (functional signals are never re-tinted to a brand hue). */
const COLOR_GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: "Brand", keys: ["brandNavy", "brandNavyDeep", "brandNavySoft"] },
  { label: "Accent", keys: ["brandGold", "brandGoldStrong", "brandGoldHover"] },
  { label: "Surfaces", keys: ["surfaceCard", "surfacePage", "surfaceMuted"] },
  { label: "Borders", keys: ["line", "lineSoft"] },
  { label: "Text", keys: ["ink", "inkMuted", "inkSubtle"] },
];

const TOKEN_LABELS: Record<string, string> = {
  brandNavy: "Primary brand",
  brandNavyDeep: "Primary deep",
  brandNavySoft: "Primary soft",
  brandGold: "Accent",
  brandGoldStrong: "Accent strong",
  brandGoldHover: "Accent hover",
  surfaceCard: "Card background",
  surfacePage: "Page background",
  surfaceMuted: "Muted background",
  line: "Borders / dividers",
  lineSoft: "Subtle borders",
  ink: "Primary text",
  inkMuted: "Secondary text",
  inkSubtle: "Tertiary text",
};

/** Addable section types (the profile-level hero has its own tab). */
const ADDABLE_SECTION_TYPES = [
  "featuredCategories",
  "featuredProducts",
  "categoryRow",
  "promoBanner",
  "brandIntro",
  "trustRow",
  "reviewSummary",
] as const;

const SECTION_TYPE_LABELS: Record<string, string> = {
  hero: "Hero",
  featuredCategories: "Featured categories",
  featuredProducts: "Featured products",
  categoryRow: "Category product row",
  promoBanner: "Promo banner",
  brandIntro: "Brand intro",
  trustRow: "Trust row",
  reviewSummary: "Review summary",
};

const SOCIAL_NETWORKS = ["instagram", "facebook", "tiktok", "youtube", "whatsapp", "x"];

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // multer limit on the backend

const newSection = (type: string): StudioSection => ({
  id: `sec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  type,
  visible: true,
  variant: "default",
  heading: "",
  subtitle: "",
  image: "",
  imageMobile: "",
  ctaLabel: "",
  ctaHref: "",
  categoryIds: [],
  productIds: [],
});

/* ── AI suggestion contract (backend aiSuggestBrandDirection) ── */

interface AiSuggestion {
  palette: Record<string, string>;
  typography: string;
  hero: {
    heading: string;
    subheading: string;
    primaryCtaLabel: string;
    secondaryCtaLabel: string;
  };
  sectionOrder: string[];
  seoTitle: string;
  seoDescription: string;
  brandTone: string;
  rationale: string;
}

/* ── catalog picker types ──────────────────────────────────── */

interface PickCategory {
  _id: string;
  name: string;
  slug?: string;
  image?: string;
}

interface PickProduct {
  _id: string;
  name: string;
  slug?: string;
  price?: number;
  images?: Array<{ url?: string } | string>;
}

const productThumb = (p: PickProduct): string => {
  const first = p.images?.[0];
  if (!first) return "";
  return typeof first === "string" ? first : first.url || "";
};

/* ============================================================
   CATALOG PICKER MODAL (products / categories, multi-select)
   ============================================================ */

const CatalogPicker: React.FC<{
  open: boolean;
  mode: "product" | "category";
  title: string;
  selectedIds: string[];
  onApply: (ids: string[]) => void;
  onClose: () => void;
}> = ({ open, mode, title, selectedIds, onApply, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Array<PickProduct | PickCategory>>([]);
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);

  const fetchItems = useCallback(
    async (page: number, q: string) => {
      setLoading(true);
      try {
        if (mode === "category") {
          const { data } = await axios.get(`${baseUrl}category/getAllCategories`, {
            withCredentials: true,
          });
          const all: PickCategory[] = Array.isArray(data?.data) ? data.data : [];
          const needle = q.trim().toLowerCase();
          setItems(
            needle ? all.filter((c) => c.name?.toLowerCase().includes(needle)) : all,
          );
          setHasMore(false);
        } else {
          const { data } = await axios.get(`${baseUrl}product/getAllProducts`, {
            withCredentials: true,
            params: { page, limit: 40, search: q.trim() || undefined },
          });
          const batch: PickProduct[] = data?.data?.products || [];
          setItems((prev) => (page === 1 ? batch : [...prev, ...batch]));
          setHasMore(!!data?.data?.pagination?.hasNextPage);
        }
      } catch {
        showToast(`Failed to load ${mode}s`, "error");
      } finally {
        setLoading(false);
      }
    },
    [mode],
  );

  useEffect(() => {
    if (!open) return;
    setSelected(selectedIds);
    setSearch("");
    pageRef.current = 1;
    fetchItems(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced search (products only — categories are filtered client-side).
  useEffect(() => {
    if (!open || mode !== "product") return;
    const t = setTimeout(() => {
      pageRef.current = 1;
      fetchItems(1, search);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open, mode]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <AdminModal open={open} onClose={onClose} title={title} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <AdminInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${mode}s…`}
            className="pl-9"
          />
        </div>

        {loading && items.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No {mode}s found{search ? ` for “${search}”` : ""}.
          </p>
        ) : (
          <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
            {items.map((item) => {
              const id = item._id;
              const checked = selected.includes(id);
              const img =
                mode === "product"
                  ? productThumb(item as PickProduct)
                  : ((item as PickCategory).image ?? "");
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className={adminCx(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                    checked
                      ? "border-[#0856DF] bg-[#0856DF]/5 ring-1 ring-[#0856DF]/30"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <span
                    className={adminCx(
                      "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border",
                      checked
                        ? "border-[#0856DF] bg-[#0856DF] text-white"
                        : "border-slate-300 bg-white",
                    )}
                    aria-hidden
                  >
                    {checked && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                      <Layers size={16} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {item.name}
                    </span>
                    {mode === "product" && typeof (item as PickProduct).price === "number" && (
                      <span className="block text-xs text-slate-500">
                        {formatPKR((item as PickProduct).price)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {mode === "product" && hasMore && (
              <AdminButton
                variant="secondary"
                size="sm"
                className="w-full"
                disabled={loading}
                onClick={() => {
                  pageRef.current += 1;
                  fetchItems(pageRef.current, search);
                }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : null}
                Load more
              </AdminButton>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs font-semibold text-slate-500">
            {selected.length} selected
          </span>
          <div className="flex gap-2">
            <AdminButton variant="secondary" size="sm" onClick={() => setSelected([])}>
              Clear
            </AdminButton>
            <AdminButton
              size="sm"
              onClick={() => {
                onApply(selected);
                onClose();
              }}
            >
              Apply selection
            </AdminButton>
          </div>
        </div>
      </div>
    </AdminModal>
  );
};

/* ============================================================
   IMAGE FIELD — upload to Cloudinary via the backend, or paste
   ============================================================ */

const ImageField: React.FC<{
  id: string;
  label: string;
  value: string;
  showcaseId: string;
  /**
   * "image" (default) — upload-only: the URL must still be SAVED with the
   * draft (dirty). "logo" — the backend persists logoUrl/logoPublicId into
   * the draft immediately and cleans up the replaced asset.
   */
  kind?: "image" | "logo";
  onChange: (
    url: string,
    opts?: { publicId?: string; persisted?: boolean },
  ) => void;
  hint?: string;
}> = ({ id, label, value, showcaseId, kind = "image", onChange, hint }) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast("Image must be under 4MB — compress it and try again", "error");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await axios.post(
        `${baseUrl}brand-profiles/admin/${showcaseId}/asset?kind=${kind}`,
        fd,
        { withCredentials: true },
      );
      if (data?.data?.url) {
        // kind=logo was persisted server-side (dirty state must not change);
        // kind=image only lands here and still needs a draft save.
        onChange(data.data.url, {
          publicId: data.data.publicId,
          persisted: kind === "logo",
        });
        showToast("Image uploaded", "success");
      }
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Upload failed"), "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <AdminLabel>{label}</AdminLabel>
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={18} className="text-slate-300" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <AdminInput
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://res.cloudinary.com/…"
          />
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              id={id}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
            <AdminButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Upload size={13} />
              )}
              Upload
            </AdminButton>
            {value && (
              <AdminButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange("")}
              >
                <Trash2 size={13} />
              </AdminButton>
            )}
          </div>
          {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   EDITOR PAGE
   ============================================================ */

const ShowcaseEditorPage = () => {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ShowcaseProfile | null>(null);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [meta, setMeta] = useState({ name: "", clientName: "", slug: "", industry: "general" });
  const [tab, setTab] = useState<Tab>("brand");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Upload for favicon (logo upload goes through the shared ImageField)
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  // F-03: sanitizer warnings returned by the most recent save
  const [saveWarnings, setSaveWarnings] = useState<SanitizerWarning[]>([]);
  // Publish
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Picker state: which section index the picker edits, and for which field
  const [picker, setPicker] = useState<
    | { open: false }
    | { open: true; field: "products" | "categories"; sectionIndex: number }
  >({ open: false });

  // AI suggestion
  const [aiOpen, setAiOpen] = useState(false);
  // F-presets: explicit per-part application (palette / typography / section
  // order) behind a confirm step — never applied silently on one click.
  const [presetApplyId, setPresetApplyId] = useState<string | null>(null);
  const [presetParts, setPresetParts] = useState({
    palette: true,
    typography: true,
    sectionOrder: false,
  });
  // F-04: picker for the profile-level category strip ordering.
  const [categoryStripPickerOpen, setCategoryStripPickerOpen] = useState(false);
  // Real category names for the strip ordering UI (shared catalog loader).
  const { categories: allCategories } = useProductCatalogOptions();
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    allCategories.forEach((c) => map.set(c._id, c.name));
    return map;
  }, [allCategories]);
  const [aiBrief, setAiBrief] = useState({
    description: "",
    audience: "",
    mood: "",
    preferredColors: "",
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  /* ── load ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${baseUrl}brand-profiles/admin/${id}`, {
        withCredentials: true,
      });
      const p: ShowcaseProfile = data?.data;
      setProfile(p);
      setConfig(p.config);
      setMeta({
        name: p.name,
        clientName: p.clientName || "",
        slug: p.slug,
        industry: p.industry,
      });
      setDirty(false);
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Failed to load showcase"), "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /* Warn before losing unsaved edits. */
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const updateConfig = useCallback(
    (fn: (c: StudioConfig) => StudioConfig) => {
      setConfig((prev) => (prev ? fn(prev) : prev));
      setDirty(true);
    },
    [],
  );

  /**
   * Merge fields into local config WITHOUT touching the dirty flag.
   *
   * Used when the SERVER already persisted the change (logo/favicon upload
   * writes the draft server-side): local state catches up to the server for
   * exactly those fields, so any pre-existing unsaved edits elsewhere remain
   * unsaved (dirty stays true) and a previously-clean state stays clean.
   * This is the F-01 guarantee: an asset upload NEVER clobbers the whole
   * local config, so unsaved edits can never be silently discarded.
   */
  const mergeConfigFromServer = useCallback(
    (fn: (c: StudioConfig) => StudioConfig) => {
      setConfig((prev) => (prev ? fn(prev) : prev));
    },
    [],
  );

  const preset = useMemo(
    () => findIndustryPreset(config?.industry || meta.industry),
    [config?.industry, meta.industry],
  );

  /* ── save draft ── */
  const save = async (): Promise<boolean> => {
    if (!config) return false;
    if (!meta.name.trim()) {
      showToast("Profile name is required", "error");
      return false;
    }
    if (!config.brandName.trim()) {
      showToast("Brand name is required", "error");
      return false;
    }
    setSaving(true);
    try {
      const { data } = await axios.put(
        `${baseUrl}brand-profiles/admin/${id}`,
        {
          name: meta.name.trim(),
          clientName: meta.clientName.trim(),
          industry: meta.industry,
          slug: meta.slug.trim() || undefined,
          config,
          // Optimistic concurrency — the server 409s (instead of silently
          // overwriting) if another tab changed the profile since load.
          expectedUpdatedAt: profile?.updatedAt,
        },
        { withCredentials: true },
      );
      const p: ShowcaseProfile = data?.data;
      const warnings =
        (data?.data as unknown as { warnings?: SanitizerWarning[] })?.warnings ?? [];
      setSaveWarnings(warnings);
      setProfile(p);
      setConfig(p.config);
      setMeta({
        name: p.name,
        clientName: p.clientName || "",
        slug: p.slug,
        industry: p.industry,
      });
      setDirty(false);
      if (warnings.length) {
        showToast(
          `Draft saved with ${warnings.length} warning${warnings.length === 1 ? "" : "s"} — review the list below before publishing`,
          "warn",
        );
      } else {
        showToast("Draft saved", "success");
      }
      return true;
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 409) {
        // Optimistic-concurrency conflict: do NOT lose the local edits
        // silently — tell the operator and let THEM decide whether to reload.
        showToast(
          "This showcase was changed in another tab — reload to get the latest version",
          "error",
        );
        if (
          window.confirm(
            "Another tab changed this showcase. Reload the latest version now? Unsaved changes in this tab will be lost.",
          )
        ) {
          await load();
        }
        return false;
      }
      showToast(apiErrorMessage(err, "Save failed"), "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  /* ── logo / favicon upload (mutates the doc server-side) ── */
  const uploadBrandAsset = async (
    file: File,
    kind: "logo" | "favicon",
    setUploading: (v: boolean) => void,
  ) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast("Image must be under 4MB — compress it and try again", "error");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await axios.post(
        `${baseUrl}brand-profiles/admin/${id}/asset?kind=${kind}`,
        fd,
        { withCredentials: true },
      );
      // F-01: merge ONLY the uploaded asset's fields — never replace the
      // whole local config from an upload response (that silently discarded
      // any unsaved edits in other tabs/fields). mergeUploadedAsset is the
      // unit-tested pure helper for exactly this merge.
      const url = data?.data?.url as string | undefined;
      const publicId = data?.data?.publicId as string | undefined;
      if (url) {
        mergeConfigFromServer((c) =>
          mergeUploadedAsset(c, kind, { url, publicId }),
        );
      }
      showToast(`${kind === "logo" ? "Logo" : "Favicon"} uploaded`, "success");
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Upload failed"), "error");
    } finally {
      setUploading(false);
    }
  };

  /* ── section helpers ── */
  const patchSection = (index: number, patch: Partial<StudioSection>) =>
    updateConfig((c) => ({
      ...c,
      sections: c.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));

  const moveSection = (index: number, dir: -1 | 1) =>
    updateConfig((c) => {
      const next = [...c.sections];
      const target = index + dir;
      if (target < 0 || target >= next.length) return c;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...c, sections: next };
    });

  const removeSection = (index: number) =>
    updateConfig((c) => ({
      ...c,
      sections: c.sections.filter((_, i) => i !== index),
    }));

  const duplicateSection = (index: number) =>
    updateConfig((c) => {
      const src = c.sections[index];
      if (!src) return c;
      const copy: StudioSection = { ...src, id: newSection(src.type).id };
      const next = [...c.sections];
      next.splice(index + 1, 0, copy);
      return { ...c, sections: next };
    });

  /* ── preset apply (fills draft fields; never re-applied on load) ── */
  // F-presets: clicking a preset opens an EXPLICIT confirm step where the
  // operator chooses palette / typography / section order (see the modal
  // below). Nothing is applied on a single click.
  const applyPreset = (presetId: string) => {
    setPresetParts({ palette: true, typography: true, sectionOrder: false });
    setPresetApplyId(presetId);
  };

  const confirmApplyPreset = () => {
    if (!presetApplyId) return;
    const p = findIndustryPreset(presetApplyId);
    updateConfig((c) => ({
      ...c,
      industry: p.id,
      theme: {
        colors: presetParts.palette ? { ...p.palette } : c.theme.colors,
        typography: presetParts.typography ? p.typography : c.theme.typography,
      },
      // Reorder-only (or empty placeholders on a fresh profile) — content
      // is NEVER deleted and no catalog data is ever invented.
      sections: presetParts.sectionOrder
        ? applySuggestedSectionOrder(c.sections, p.sectionOrder, newSection)
        : c.sections,
    }));
    setMeta((m) => ({ ...m, industry: p.id }));
    setPresetApplyId(null);
    const applied = [
      presetParts.palette && "palette",
      presetParts.typography && "typography",
      presetParts.sectionOrder && "section order",
    ].filter(Boolean);
    showToast(
      applied.length
        ? `“${p.name}” — applied ${applied.join(", ")} — review, then save`
        : `“${p.name}” selected as the industry — nothing else changed`,
      "success",
    );
  };

  /* ── F-04: profile-level category strip ordering ── */
  const moveCategoryOrder = (index: number, dir: -1 | 1) =>
    updateConfig((c) => {
      const next = [...c.categoryOrder];
      const target = index + dir;
      if (target < 0 || target >= next.length) return c;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...c, categoryOrder: next };
    });

  const removeCategoryOrder = (index: number) =>
    updateConfig((c) => ({
      ...c,
      categoryOrder: c.categoryOrder.filter((_, i) => i !== index),
    }));

  /* ── AI suggestion ── */
  const runAiSuggest = async () => {
    setAiLoading(true);
    setAiUnavailable(false);
    try {
      const { data } = await axios.post(
        `${baseUrl}brand-profiles/admin/ai/suggest`,
        {
          brandName: config?.brandName || meta.name,
          industry: meta.industry,
          description: aiBrief.description.trim() || undefined,
          audience: aiBrief.audience.trim() || undefined,
          mood: aiBrief.mood.trim() || undefined,
          preferredColors: aiBrief.preferredColors.trim() || undefined,
        },
        { withCredentials: true },
      );
      if (data?.data?.suggestion) {
        setAiSuggestion(data.data.suggestion);
      }
    } catch (err: unknown) {
      const axiosErr = axios.isAxiosError(err) ? err : null;
      if (axiosErr?.response?.data?.code === "AI_NOT_CONFIGURED") {
        setAiUnavailable(true);
      } else {
        showToast(apiErrorMessage(err, "AI suggestion failed"), "error");
      }
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiSuggestion = () => {
    if (!aiSuggestion) return;
    const s = aiSuggestion;
    updateConfig((c) => {
      // Reorder existing sections per the suggested order; create empty
      // stubs for suggested types that don't exist yet (never fake copy).
      const suggested = s.sectionOrder.filter((t) => t !== "hero");
      const ordered: StudioSection[] = [];
      const pool = [...c.sections];
      for (const type of suggested) {
        const idx = pool.findIndex((sec) => sec.type === type);
        if (idx >= 0) ordered.push(pool.splice(idx, 1)[0]);
        else ordered.push(newSection(type));
      }
      return {
        ...c,
        theme: {
          colors: { ...c.theme.colors, ...s.palette },
          typography: (s.typography as TypographyPresetId) || c.theme.typography,
        },
        hero: {
          ...c.hero,
          heading: s.hero.heading || c.hero.heading,
          subheading: s.hero.subheading || c.hero.subheading,
          primaryCta: {
            ...c.hero.primaryCta,
            label: s.hero.primaryCtaLabel || c.hero.primaryCta.label,
          },
          secondaryCta: {
            ...c.hero.secondaryCta,
            label: s.hero.secondaryCtaLabel || c.hero.secondaryCta.label,
          },
        },
        seoTitle: s.seoTitle || c.seoTitle,
        seoDescription: s.seoDescription || c.seoDescription,
        sections: [...ordered, ...pool],
      };
    });
    setAiOpen(false);
    setAiSuggestion(null);
    showToast("AI direction applied to the draft — review, then save", "success");
  };

  /* ── publish lifecycle ── */
  const publish = async () => {
    if (!config) return;
    // F-03: pre-check the same blocking rules the server enforces so the
    // operator sees exactly what is missing instead of a bare 400.
    const blocking = config.sections
      .map((s, i) => ({ i, type: s.type, need: sectionIssue(s) }))
      .filter((x) => x.need);
    if (!config.brandName.trim() || blocking.length) {
      const parts = [
        ...(!config.brandName.trim() ? ["Brand name is required"] : []),
        ...blocking.map(
          (x) => `Section ${x.i + 1} (${SECTION_TYPE_LABELS[x.type] || x.type}) needs ${x.need}`,
        ),
      ];
      showToast(`Cannot publish — ${parts.join("; ")}`, "error");
      return;
    }
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setPublishing(true);
    try {
      await axios.post(
        `${baseUrl}brand-profiles/admin/${id}/publish`,
        { note: publishNote.trim() || undefined },
        { withCredentials: true },
      );
      showToast("Showcase published — live on the storefront", "success");
      setPublishOpen(false);
      setPublishNote("");
      load();
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Publish failed"), "error");
    } finally {
      setPublishing(false);
    }
  };

  const restoreVersion = async (version: number) => {
    setBusyId(`v${version}`);
    try {
      await axios.post(
        `${baseUrl}brand-profiles/admin/${id}/versions/${version}/restore`,
        {},
        { withCredentials: true },
      );
      showToast(`Version ${version} restored into the draft — save & publish to make it live`, "success");
      load();
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Restore failed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const setArchived = async (archived: boolean) => {
    setBusyId("archive");
    try {
      await axios.post(
        `${baseUrl}brand-profiles/admin/${id}/${archived ? "archive" : "unarchive"}`,
        {},
        { withCredentials: true },
      );
      showToast(archived ? "Showcase archived" : "Showcase restored", "success");
      load();
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Action failed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  /* ── render ── */
  if (loading || !config || !profile) {
    return (
      <div className="flex flex-col items-center gap-4">
        <AdminLoading message="Loading showcase…" />
        {!loading && !profile && (
          <Link href="/Admin/ShowcaseStudio">
            <AdminButton variant="secondary" size="sm">Back to Showcase Studio</AdminButton>
          </Link>
        )}
      </div>
    );
  }

  const presetPalette = preset.palette as unknown as Record<string, string>;
  const effectiveColor = (key: string): string =>
    config.theme.colors[key] || presetPalette[key] || "#000000";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={profile.name || "Showcase"}
        subtitle={`Public URL: /store/${profile.slug}`}
        actions={
          <>
            <Link href="/Admin/ShowcaseStudio">
              <AdminButton variant="ghost" size="sm">← All showcases</AdminButton>
            </Link>
            <Link href={`/Admin/ShowcaseStudio/${id}/preview`}>
              <AdminButton variant="secondary" size="sm">
                <Eye size={14} /> Preview draft
              </AdminButton>
            </Link>
            <AdminButton size="sm" disabled={saving} onClick={save}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save draft
            </AdminButton>
            <AdminButton variant="success" size="sm" onClick={() => setPublishOpen(true)}>
              <Rocket size={14} /> Publish
            </AdminButton>
          </>
        }
      />

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-2">
        <AdminBadge tone={STATUS_TONE[profile.status] || "slate"}>
          {STATUS_LABEL[profile.status] || profile.status}
        </AdminBadge>
        {dirty && <AdminBadge tone="amber">Unsaved changes</AdminBadge>}
        {profile.hasPublishedConfig && (
          <span className="text-xs text-slate-400">
            Live since {profile.publishedAt ? new Date(profile.publishedAt).toLocaleString() : "—"}
          </span>
        )}
      </div>

      {/* Sanitizer warnings from the last save (F-03) — nothing is lost silently */}
      {saveWarnings.length > 0 && (
        <AdminCard className="border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-800">
                {saveWarnings.length} thing{saveWarnings.length === 1 ? "" : "s"} need
                {saveWarnings.length === 1 ? "s" : ""} attention before publishing
              </p>
              <ul className="space-y-0.5">
                {saveWarnings.slice(0, 6).map((w, i) => (
                  <li key={`${w.path}-${i}`} className="text-[11px] leading-snug text-amber-700">
                    <span className="font-semibold">{w.path}:</span> {w.message}
                  </li>
                ))}
              </ul>
              {saveWarnings.length > 6 && (
                <p className="text-[11px] text-amber-600">+{saveWarnings.length - 6} more</p>
              )}
            </div>
          </div>
        </AdminCard>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = TAB_META[t].icon;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={adminCx(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                tab === t
                  ? "bg-[#0856DF] text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50",
              )}
            >
              <Icon size={15} />
              {TAB_META[t].label}
            </button>
          );
        })}
      </div>

      {/* ══════════════ BRAND & SEO ══════════════ */}
      {tab === "brand" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">Profile</h3>
            <div>
              <AdminLabel>Profile name *</AdminLabel>
              <AdminInput
                value={meta.name}
                onChange={(e) => {
                  setMeta((m) => ({ ...m, name: e.target.value }));
                  setDirty(true);
                }}
                maxLength={100}
              />
            </div>
            <div>
              <AdminLabel>Client / company</AdminLabel>
              <AdminInput
                value={meta.clientName}
                onChange={(e) => {
                  setMeta((m) => ({ ...m, clientName: e.target.value }));
                  setDirty(true);
                }}
                maxLength={120}
              />
            </div>
            <div>
              <AdminLabel>Slug (public URL)</AdminLabel>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-400">/store/</span>
                <AdminInput
                  value={meta.slug}
                  onChange={(e) => {
                    setMeta((m) => ({ ...m, slug: e.target.value.toLowerCase() }));
                    setDirty(true);
                  }}
                  maxLength={60}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Lowercase letters, numbers and dashes. Changing it moves the public URL.
              </p>
            </div>
            <div>
              <AdminLabel>Industry preset</AdminLabel>
              <AdminSelect
                value={meta.industry}
                onChange={(e) => {
                  setMeta((m) => ({ ...m, industry: e.target.value }));
                  updateConfig((c) => ({ ...c, industry: e.target.value }));
                }}
              >
                {INDUSTRY_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </AdminSelect>
            </div>
          </AdminCard>

          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">Brand identity</h3>
            <div>
              <AdminLabel>Brand name *</AdminLabel>
              <AdminInput
                value={config.brandName}
                onChange={(e) => updateConfig((c) => ({ ...c, brandName: e.target.value }))}
                maxLength={80}
              />
            </div>
            <div>
              <AdminLabel>Tagline</AdminLabel>
              <AdminInput
                value={config.tagline}
                onChange={(e) => updateConfig((c) => ({ ...c, tagline: e.target.value }))}
                maxLength={160}
                placeholder="One line that captures the brand"
              />
            </div>
            <ImageField
              id="logo-upload"
              label="Logo"
              value={config.logoUrl}
              showcaseId={id}
              kind="logo"
              onChange={(url, opts) => {
                const merge = (c: StudioConfig): StudioConfig => {
                  const next: StudioConfig = {
                    ...c,
                    logoUrl: url,
                    logoPublicId:
                      opts?.publicId !== undefined
                        ? opts.publicId
                        : url === c.logoUrl
                          ? c.logoPublicId
                          : "", // manual URL change → we no longer know the asset id
                  };
                  return next;
                };
                // Uploaded logo was persisted server-side; a manual paste or
                // clear is a draft edit that still needs saving.
                if (opts?.persisted) mergeConfigFromServer(merge);
                else updateConfig(merge);
              }}
              hint="Shown in the masthead and browser tab. Square-ish images look best."
            />
            <div>
              <AdminLabel>Favicon</AdminLabel>
              <div className="flex items-center gap-3">
                {config.faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={config.faviconUrl}
                    alt=""
                    className="h-8 w-8 rounded-lg border border-slate-200 object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                    <ImageIcon size={14} />
                  </span>
                )}
                <input
                  id="favicon-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadBrandAsset(f, "favicon", setUploadingFavicon);
                    e.target.value = "";
                  }}
                />
                <AdminButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={uploadingFavicon}
                  onClick={() => document.getElementById("favicon-upload")?.click()}
                >
                  {uploadingFavicon ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  Upload favicon
                </AdminButton>
              </div>
            </div>
          </AdminCard>

          <AdminCard className="space-y-4 p-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-slate-900">SEO</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <AdminLabel>
                  Meta title{" "}
                  <span className="normal-case text-slate-400">({config.seoTitle.length}/70)</span>
                </AdminLabel>
                <AdminInput
                  value={config.seoTitle}
                  onChange={(e) => updateConfig((c) => ({ ...c, seoTitle: e.target.value }))}
                  maxLength={70}
                  placeholder={`${config.brandName} | Online Store`}
                />
              </div>
              <div>
                <AdminLabel>
                  Meta description{" "}
                  <span className="normal-case text-slate-400">({config.seoDescription.length}/170)</span>
                </AdminLabel>
                <AdminTextarea
                  value={config.seoDescription}
                  onChange={(e) => updateConfig((c) => ({ ...c, seoDescription: e.target.value }))}
                  maxLength={170}
                  rows={3}
                />
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <input
                  id="seo-indexable"
                  type="checkbox"
                  checked={config.seoIndexable}
                  onChange={(e) =>
                    updateConfig((c) => ({ ...c, seoIndexable: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]"
                />
                <label htmlFor="seo-indexable" className="text-xs leading-snug text-slate-600">
                  <span className="font-semibold text-slate-800">
                    Allow search engines to index this showcase
                  </span>
                  <br />
                  Off by default: demo storefronts are served as{" "}
                  <code className="rounded bg-slate-200 px-1">noindex,nofollow</code> until
                  you opt in. The /store directory itself is never indexed.
                </label>
              </div>
            </div>
          </AdminCard>
        </div>
      )}

      {/* ══════════════ THEME ══════════════ */}
      {tab === "theme" && (
        <div className="space-y-6">
          {/* Presets */}
          <AdminCard className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Industry presets</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Applying a preset fills the palette & typography below — every value stays editable.
                </p>
              </div>
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() => setAiOpen(true)}
              >
                <Sparkles size={13} /> AI brand direction
              </AdminButton>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {INDUSTRY_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={adminCx(
                    "rounded-xl border p-4 text-left transition",
                    meta.industry === p.id
                      ? "border-[#0856DF] ring-1 ring-[#0856DF]/30"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {[p.palette.brandNavy, p.palette.brandGold, p.palette.surfacePage].map(
                      (color, i) => (
                        <span
                          key={i}
                          className="h-5 w-5 rounded-full border border-black/10"
                          style={{ backgroundColor: color }}
                        />
                      ),
                    )}
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-800">{p.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{p.description}</p>
                </button>
              ))}
            </div>
          </AdminCard>

          {/* Typography */}
          <AdminCard className="space-y-3 p-5">
            <h3 className="text-sm font-bold text-slate-900">Typography</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(TYPOGRAPHY_OPTIONS) as TypographyPresetId[]).map((key) => {
                const opt = TYPOGRAPHY_OPTIONS[key];
                const active = config.theme.typography === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      updateConfig((c) => ({
                        ...c,
                        theme: { ...c.theme, typography: key },
                      }))
                    }
                    className={adminCx(
                      "rounded-xl border p-4 text-left transition",
                      active
                        ? "border-[#0856DF] ring-1 ring-[#0856DF]/30"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <p
                      className="text-lg font-black text-slate-900"
                      style={{ fontFamily: opt.headingFont }}
                    >
                      Aa
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{opt.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{opt.note}</p>
                  </button>
                );
              })}
            </div>
          </AdminCard>

          {/* Colours */}
          <AdminCard className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Colours</h3>
              {Object.keys(config.theme.colors).length > 0 && (
                <AdminButton
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    updateConfig((c) => ({ ...c, theme: { ...c.theme, colors: {} } }))
                  }
                >
                  <Undo2 size={13} /> Reset to preset
                </AdminButton>
              )}
            </div>
            <div className="mt-4 space-y-5">
              {COLOR_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {group.label}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {group.keys.map((key) => {
                      const overridden = !!config.theme.colors[key];
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                        >
                          <input
                            type="color"
                            value={effectiveColor(key)}
                            onChange={(e) =>
                              updateConfig((c) => ({
                                ...c,
                                theme: {
                                  ...c.theme,
                                  colors: { ...c.theme.colors, [key]: e.target.value },
                                },
                              }))
                            }
                            className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-transparent p-0"
                            aria-label={TOKEN_LABELS[key] || key}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-700">
                              {TOKEN_LABELS[key] || key}
                            </p>
                            <p className="font-mono text-[11px] uppercase text-slate-400">
                              {effectiveColor(key)}
                            </p>
                          </div>
                          {overridden && (
                            <button
                              type="button"
                              title="Reset this token to the preset value"
                              onClick={() =>
                                updateConfig((c) => {
                                  const colors = { ...c.theme.colors };
                                  delete colors[key];
                                  return { ...c, theme: { ...c.theme, colors } };
                                })
                              }
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            >
                              <Undo2 size={13} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-slate-400">
              Status colours (success/warning/danger/info) are fixed platform signals and are
              never re-tinted per brand.
            </p>
          </AdminCard>
        </div>
      )}

      {/* ══════════════ HERO ══════════════ */}
      {tab === "hero" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">Hero copy</h3>
            <div>
              <AdminLabel>Heading</AdminLabel>
              <AdminInput
                value={config.hero.heading}
                onChange={(e) =>
                  updateConfig((c) => ({ ...c, hero: { ...c.hero, heading: e.target.value } }))
                }
                maxLength={120}
                placeholder={preset.hero.headingHint}
              />
            </div>
            <div>
              <AdminLabel>Subheading</AdminLabel>
              <AdminTextarea
                value={config.hero.subheading}
                onChange={(e) =>
                  updateConfig((c) => ({ ...c, hero: { ...c.hero, subheading: e.target.value } }))
                }
                maxLength={300}
                rows={3}
                placeholder={preset.hero.subheadingHint}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <AdminLabel>Primary button</AdminLabel>
                <AdminInput
                  value={config.hero.primaryCta.label}
                  onChange={(e) =>
                    updateConfig((c) => ({
                      ...c,
                      hero: { ...c.hero, primaryCta: { ...c.hero.primaryCta, label: e.target.value } },
                    }))
                  }
                  maxLength={40}
                  placeholder={preset.hero.primaryCtaHint}
                />
                <AdminInput
                  className="mt-2"
                  value={config.hero.primaryCta.href}
                  onChange={(e) =>
                    updateConfig((c) => ({
                      ...c,
                      hero: { ...c.hero, primaryCta: { ...c.hero.primaryCta, href: e.target.value } },
                    }))
                  }
                  placeholder="/productsPage"
                />
              </div>
              <div>
                <AdminLabel>Secondary button (optional)</AdminLabel>
                <AdminInput
                  value={config.hero.secondaryCta.label}
                  onChange={(e) =>
                    updateConfig((c) => ({
                      ...c,
                      hero: { ...c.hero, secondaryCta: { ...c.hero.secondaryCta, label: e.target.value } },
                    }))
                  }
                  maxLength={40}
                />
                <AdminInput
                  className="mt-2"
                  value={config.hero.secondaryCta.href}
                  onChange={(e) =>
                    updateConfig((c) => ({
                      ...c,
                      hero: { ...c.hero, secondaryCta: { ...c.hero.secondaryCta, href: e.target.value } },
                    }))
                  }
                  placeholder="/productsPage"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Links may be internal routes (/productsPage) or full https URLs.
            </p>
          </AdminCard>

          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">Hero imagery</h3>
            <ImageField
              id="hero-image"
              label="Desktop image"
              value={config.hero.image}
              showcaseId={id}
              onChange={(url) => updateConfig((c) => ({ ...c, hero: { ...c.hero, image: url } }))}
              hint={preset.hero.imageHint}
            />
            <ImageField
              id="hero-image-mobile"
              label="Mobile image (optional)"
              value={config.hero.imageMobile}
              showcaseId={id}
              onChange={(url) =>
                updateConfig((c) => ({ ...c, hero: { ...c.hero, imageMobile: url } }))
              }
              hint="Portrait crop shown on small screens when set."
            />
          </AdminCard>
        </div>
      )}

      {/* ══════════════ HOMEPAGE SECTIONS ══════════════ */}
      {tab === "sections" && (
        <div className="space-y-4">
          <AdminCard className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Homepage sections</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {config.sections.length} section{config.sections.length === 1 ? "" : "s"} — rendered top to bottom.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AdminSelect
                aria-label="Section type to add"
                value=""
                onChange={(e) => {
                  const type = e.target.value;
                  if (type) {
                    updateConfig((c) => ({
                      ...c,
                      sections: [...c.sections, newSection(type)],
                    }));
                  }
                }}
              >
                <option value="">Add a section…</option>
                {ADDABLE_SECTION_TYPES.map((t) => (
                  <option key={t} value={t}>{SECTION_TYPE_LABELS[t]}</option>
                ))}
              </AdminSelect>
            </div>
          </AdminCard>

          {/* Profile-level category strip ordering (F-04) — drives the
              storefront's "Shop by Category" strip when no categories
              section covers it. Real categories only. */}
          <AdminCard className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Profile category strip</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ordering for the “Shop by Category” strip on the storefront
                  (shown only when no categories section covers it).
                </p>
              </div>
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() => setCategoryStripPickerOpen(true)}
              >
                <Plus size={13} /> Add categories
              </AdminButton>
            </div>
            {config.categoryOrder.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                No profile categories yet — the storefront strip stays hidden
                until you add some.
              </p>
            ) : (
              <div className="space-y-1.5">
                {config.categoryOrder.map((catId, i) => (
                  <div
                    key={catId}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                      {i + 1}. {categoryNameById.get(catId) || "Unknown category"}
                    </span>
                    <button
                      type="button"
                      title="Move up"
                      disabled={i === 0}
                      onClick={() => moveCategoryOrder(i, -1)}
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      disabled={i === config.categoryOrder.length - 1}
                      onClick={() => moveCategoryOrder(i, 1)}
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      title="Remove from strip"
                      onClick={() => removeCategoryOrder(i)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>

          {config.sections.length === 0 && (
            <AdminCard className="py-14 text-center">
              <Layers size={24} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-600">
                No homepage sections yet
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Add categories, products, banners and brand blocks from the selector above.
              </p>
            </AdminCard>
          )}

          {config.sections.map((section, index) => (
            <AdminCard key={section.id} className="p-5">
              {/* Section header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AdminBadge tone={section.visible ? "blue" : "slate"}>
                    {SECTION_TYPE_LABELS[section.type] || section.type}
                  </AdminBadge>
                  {!section.visible && <span className="text-xs text-slate-400">Hidden on the storefront</span>}
                  {sectionIssue(section) && (
                    <span
                      title="This section is saved, but publish is blocked until it is filled in, hidden or removed"
                      className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700"
                    >
                      <AlertTriangle size={10} /> Needs {sectionIssue(section)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Move up"
                    disabled={index === 0}
                    onClick={() => moveSection(index, -1)}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    disabled={index === config.sections.length - 1}
                    onClick={() => moveSection(index, 1)}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    title={section.visible ? "Hide section" : "Show section"}
                    onClick={() => patchSection(index, { visible: !section.visible })}
                    className={adminCx(
                      "rounded-lg p-2 transition",
                      section.visible
                        ? "text-emerald-600 hover:bg-emerald-50"
                        : "text-slate-400 hover:bg-slate-100",
                    )}
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    type="button"
                    title="Duplicate section"
                    onClick={() => duplicateSection(index)}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    type="button"
                    title="Delete section"
                    onClick={() => removeSection(index)}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Section fields */}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <AdminLabel>Heading</AdminLabel>
                  <AdminInput
                    value={section.heading}
                    onChange={(e) => patchSection(index, { heading: e.target.value })}
                    maxLength={120}
                  />
                </div>
                {SECTION_VARIANT_OPTIONS[section.type] && (
                  <div>
                    <AdminLabel>Layout variant</AdminLabel>
                    <AdminSelect
                      aria-label="Layout variant"
                      value={section.variant}
                      onChange={(e) => patchSection(index, { variant: e.target.value })}
                    >
                      {SECTION_VARIANT_OPTIONS[section.type].map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </AdminSelect>
                  </div>
                )}
                <div>
                  <AdminLabel>Subheading</AdminLabel>
                  <AdminInput
                    value={section.subtitle}
                    onChange={(e) => patchSection(index, { subtitle: e.target.value })}
                    maxLength={240}
                  />
                </div>

                {(section.type === "promoBanner" || section.type === "hero") && (
                  <>
                    <ImageField
                      id={`sec-img-${section.id}`}
                      label="Banner image"
                      value={section.image}
                      showcaseId={id}
                      onChange={(url) => patchSection(index, { image: url })}
                    />
                    <div className="grid gap-3">
                      <div>
                        <AdminLabel>Button label</AdminLabel>
                        <AdminInput
                          value={section.ctaLabel}
                          onChange={(e) => patchSection(index, { ctaLabel: e.target.value })}
                          maxLength={60}
                        />
                      </div>
                      <div>
                        <AdminLabel>Button link</AdminLabel>
                        <AdminInput
                          value={section.ctaHref}
                          onChange={(e) => patchSection(index, { ctaHref: e.target.value })}
                          placeholder="/productsPage"
                        />
                      </div>
                    </div>
                  </>
                )}

                {(section.type === "featuredCategories" || section.type === "categoryRow") && (
                  <div className="sm:col-span-2">
                    <AdminLabel>
                      Categories ({section.categoryIds.length} selected)
                    </AdminLabel>
                    <AdminButton
                      variant="secondary"
                      size="sm"
                      onClick={() => setPicker({ open: true, field: "categories", sectionIndex: index })}
                    >
                      <Plus size={13} /> Choose categories
                    </AdminButton>
                    {section.categoryIds.length > 0 && (
                      <p className="mt-2 font-mono text-[11px] text-slate-400">
                        {section.categoryIds.length} real catalog categor{section.categoryIds.length === 1 ? "y" : "ies"} featured
                      </p>
                    )}
                  </div>
                )}

                {section.type === "featuredProducts" && (
                  <div className="sm:col-span-2">
                    <AdminLabel>
                      Products ({section.productIds.length} selected)
                    </AdminLabel>
                    <AdminButton
                      variant="secondary"
                      size="sm"
                      onClick={() => setPicker({ open: true, field: "products", sectionIndex: index })}
                    >
                      <Plus size={13} /> Choose products
                    </AdminButton>
                  </div>
                )}
              </div>
            </AdminCard>
          ))}
        </div>
      )}

      {/* ══════════════ CONTACT & FOOTER ══════════════ */}
      {tab === "contact" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">Contact details</h3>
            <div>
              <AdminLabel>Address</AdminLabel>
              <AdminTextarea
                value={config.contact.address}
                onChange={(e) =>
                  updateConfig((c) => ({ ...c, contact: { ...c.contact, address: e.target.value } }))
                }
                maxLength={240}
                rows={2}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <AdminLabel>Phone</AdminLabel>
                <AdminInput
                  value={config.contact.phone}
                  onChange={(e) =>
                    updateConfig((c) => ({ ...c, contact: { ...c.contact, phone: e.target.value } }))
                  }
                  maxLength={40}
                />
              </div>
              <div>
                <AdminLabel>Email</AdminLabel>
                <AdminInput
                  type="email"
                  value={config.contact.email}
                  onChange={(e) =>
                    updateConfig((c) => ({ ...c, contact: { ...c.contact, email: e.target.value } }))
                  }
                  maxLength={120}
                />
              </div>
            </div>
            <div>
              <AdminLabel>WhatsApp</AdminLabel>
              <AdminInput
                value={config.contact.whatsapp}
                onChange={(e) =>
                  updateConfig((c) => ({ ...c, contact: { ...c.contact, whatsapp: e.target.value } }))
                }
                maxLength={40}
                placeholder="+92 300 0000000"
              />
            </div>

            <div>
              <AdminLabel>Social links</AdminLabel>
              <div className="space-y-2">
                {SOCIAL_NETWORKS.map((network) => (
                  <div key={network} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs font-semibold capitalize text-slate-500">
                      {network}
                    </span>
                    <AdminInput
                      value={config.contact.social[network] || ""}
                      onChange={(e) =>
                        updateConfig((c) => ({
                          ...c,
                          contact: {
                            ...c.contact,
                            social: { ...c.contact.social, [network]: e.target.value },
                          },
                        }))
                      }
                      placeholder="https://…"
                    />
                    {config.contact.social[network] && (
                      <button
                        type="button"
                        onClick={() =>
                          updateConfig((c) => {
                            const social = { ...c.contact.social };
                            delete social[network];
                            return { ...c, contact: { ...c.contact, social } };
                          })
                        }
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </AdminCard>

          <div className="space-y-6">
            <AdminCard className="space-y-4 p-5">
              <h3 className="text-sm font-bold text-slate-900">Footer</h3>
              <div>
                <AdminLabel>Footer description</AdminLabel>
                <AdminTextarea
                  value={config.footer.description}
                  onChange={(e) =>
                    updateConfig((c) => ({ ...c, footer: { ...c.footer, description: e.target.value } }))
                  }
                  maxLength={400}
                  rows={3}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.footer.poweredBy}
                  onChange={(e) =>
                    updateConfig((c) => ({ ...c, footer: { ...c.footer, poweredBy: e.target.checked } }))
                  }
                  className="h-4 w-4 rounded border-slate-300 accent-[#0856DF]"
                />
                <span className="text-sm font-medium text-slate-700">
                  Show “Powered by Jazari Tech Official” in the footer
                </span>
              </label>
            </AdminCard>

            <AdminCard className="space-y-4 p-5">
              <h3 className="text-sm font-bold text-slate-900">Demo watermark</h3>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.previewWatermark}
                  onChange={(e) =>
                    updateConfig((c) => ({ ...c, previewWatermark: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 accent-[#0856DF]"
                />
                <span className="text-sm font-medium text-slate-700">
                  Show a demo watermark on the storefront
                </span>
              </label>
              {config.previewWatermark && (
                <div>
                  <AdminLabel>Watermark text</AdminLabel>
                  <AdminInput
                    value={config.watermarkText}
                    onChange={(e) =>
                      updateConfig((c) => ({ ...c, watermarkText: e.target.value }))
                    }
                    maxLength={80}
                  />
                </div>
              )}
            </AdminCard>
          </div>
        </div>
      )}

      {/* ══════════════ PUBLISH ══════════════ */}
      {tab === "publish" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">Status</h3>
            <div className="flex flex-wrap items-center gap-3">
              <AdminBadge tone={STATUS_TONE[profile.status] || "slate"}>
                {STATUS_LABEL[profile.status] || profile.status}
              </AdminBadge>
              {profile.hasPublishedConfig && (
                <span className="text-xs text-slate-500">
                  Live version published{" "}
                  {profile.publishedAt
                    ? new Date(profile.publishedAt).toLocaleString()
                    : ""}
                </span>
              )}
              {profile.status === "published" && (
                <a href={`/store/${profile.slug}`} target="_blank" rel="noopener noreferrer">
                  <AdminButton variant="secondary" size="sm">
                    <ExternalLink size={13} /> Open live store
                  </AdminButton>
                </a>
              )}
            </div>
            {dirty && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
                You have unsaved draft changes — Publishing saves the draft first, then publishes it.
              </p>
            )}
            <p className="text-xs leading-relaxed text-slate-500">
              Publishing snapshots the current draft into an immutable version and serves it at{" "}
              <span className="font-mono">/store/{profile.slug}</span>. Previous versions stay
              restorable below.
            </p>
            <div className="flex flex-wrap gap-2">
              <AdminButton variant="success" onClick={() => setPublishOpen(true)}>
                <Rocket size={14} /> Publish now
              </AdminButton>
              {profile.status === "archived" ? (
                <AdminButton
                  variant="secondary"
                  disabled={busyId === "archive"}
                  onClick={() => setArchived(false)}
                >
                  <ArchiveRestore size={14} /> Restore from archive
                </AdminButton>
              ) : (
                <AdminButton
                  variant="ghost"
                  disabled={busyId === "archive"}
                  onClick={() => setArchived(true)}
                >
                  <Archive size={14} /> Archive
                </AdminButton>
              )}
            </div>
          </AdminCard>

          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">
              Version history ({profile.versions.length})
            </h3>
            {profile.versions.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Nothing published yet — versions appear here after each publish.
              </p>
            ) : (
              <div className="space-y-2">
                {profile.versions.map((v) => (
                  <div
                    key={v.version}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">
                        v{v.version}
                        {v.note ? ` — ${v.note}` : ""}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {v.publishedAt ? new Date(v.publishedAt).toLocaleString() : ""}
                      </p>
                    </div>
                    <AdminButton
                      variant="secondary"
                      size="sm"
                      disabled={busyId === `v${v.version}`}
                      onClick={() => restoreVersion(v.version)}
                      title="Copy this version back into the draft"
                    >
                      {busyId === `v${v.version}` ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Undo2 size={13} />
                      )}
                      Restore to draft
                    </AdminButton>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
        </div>
      )}

      {/* ── catalog picker ── */}
      {picker.open && (
        <CatalogPicker
          open
          mode={picker.field === "products" ? "product" : "category"}
          title={picker.field === "products" ? "Choose products" : "Choose categories"}
          selectedIds={
            picker.field === "products"
              ? config.sections[picker.sectionIndex]?.productIds || []
              : config.sections[picker.sectionIndex]?.categoryIds || []
          }
          onApply={(ids) =>
            patchSection(
              picker.sectionIndex,
              picker.field === "products" ? { productIds: ids } : { categoryIds: ids },
            )
          }
          onClose={() => setPicker({ open: false })}
        />
      )}

      {/* ── profile category strip picker (F-04) ── */}
      {categoryStripPickerOpen && (
        <CatalogPicker
          open
          mode="category"
          title="Pick profile categories for the storefront strip"
          selectedIds={config.categoryOrder}
          onApply={(ids) =>
            updateConfig((c) => ({ ...c, categoryOrder: appendCategoryOrder([], ids) }))
          }
          onClose={() => setCategoryStripPickerOpen(false)}
        />
      )}

      {/* ── preset apply confirm (F-presets) ── */}
      {presetApplyId && (
        <AdminModal
          open
          onClose={() => setPresetApplyId(null)}
          title={`Apply “${findIndustryPreset(presetApplyId).name}”`}
          maxWidth="max-w-md"
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Choose what to apply — every value stays editable afterwards and
              nothing is ever re-applied automatically.
            </p>
            {(
              [
                [
                  "palette",
                  "Palette",
                  "Colour tokens across the whole storefront",
                ],
                ["typography", "Typography", "Heading / body font preset"],
                [
                  "sectionOrder",
                  "Section order",
                  findIndustryPreset(presetApplyId)
                    .sectionOrder.map((t) => SECTION_TYPE_LABELS[t] || t)
                    .join(" → "),
                ],
              ] as const
            ).map(([key, label, desc]) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-slate-300"
              >
                <input
                  type="checkbox"
                  checked={presetParts[key]}
                  onChange={(e) =>
                    setPresetParts((s) => ({ ...s, [key]: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">
                    {label}
                  </span>
                  <span className="block text-xs text-slate-500">{desc}</span>
                  {key === "sectionOrder" && (
                    <span className="mt-1 block text-[11px] text-slate-400">
                      Reorders existing sections only — never deletes content.
                      With no sections yet, it creates empty placeholders to fill
                      with real products and categories.
                    </span>
                  )}
                </span>
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-1">
              <AdminButton
                variant="ghost"
                onClick={() => setPresetApplyId(null)}
              >
                Cancel
              </AdminButton>
              <AdminButton onClick={confirmApplyPreset}>Apply</AdminButton>
            </div>
          </div>
        </AdminModal>
      )}

      {/* ── publish modal ── */}
      <AdminModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish showcase"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            Publishing makes the current draft live at{" "}
            <span className="font-mono text-sm">/store/{profile.slug}</span> for everyone. A
            version snapshot is recorded so you can always restore it later.
          </p>
          <div>
            <AdminLabel>Release note (optional)</AdminLabel>
            <AdminInput
              value={publishNote}
              onChange={(e) => setPublishNote(e.target.value)}
              maxLength={200}
              placeholder="e.g. Initial client pitch version"
            />
          </div>
          <div className="flex justify-end gap-2">
            <AdminButton variant="secondary" onClick={() => setPublishOpen(false)}>
              Cancel
            </AdminButton>
            <AdminButton variant="success" disabled={publishing} onClick={publish}>
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              Publish
            </AdminButton>
          </div>
        </div>
      </AdminModal>

      {/* ── AI suggestion modal ── */}
      <AdminModal
        open={aiOpen}
        onClose={() => {
          setAiOpen(false);
          setAiSuggestion(null);
        }}
        title="AI brand direction"
        maxWidth="max-w-2xl"
      >
        {aiUnavailable ? (
          <div className="space-y-4 text-center">
            <Lock size={26} className="mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">
              AI suggestions are unavailable
            </p>
            <p className="text-xs text-slate-500">
              GEMINI_API_KEY is not configured on this deployment. Every manual editing tool
              in this Studio remains fully available.
            </p>
          </div>
        ) : aiSuggestion ? (
          <div className="space-y-4">
            {/* Suggestion preview — editable only via "apply", then normal editing */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Rationale
              </p>
              <p className="mt-1 text-sm text-slate-700">{aiSuggestion.rationale}</p>
              {aiSuggestion.brandTone && (
                <p className="mt-2 text-xs text-slate-500">
                  Tone: {aiSuggestion.brandTone}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Palette</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(aiSuggestion.palette).map(([key, color]) => (
                  <span
                    key={key}
                    className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/10"
                      style={{ backgroundColor: color }}
                    />
                    {color}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">Hero heading</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {aiSuggestion.hero.heading || "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">{aiSuggestion.hero.subheading}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">Typography & sections</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {TYPOGRAPHY_OPTIONS[aiSuggestion.typography as TypographyPresetId]?.label ||
                    aiSuggestion.typography}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {aiSuggestion.sectionOrder
                    .map((t) => SECTION_TYPE_LABELS[t] || t)
                    .join(" → ")}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() => setAiSuggestion(null)}
              >
                Back
              </AdminButton>
              <AdminButton size="sm" onClick={applyAiSuggestion}>
                <Sparkles size={13} /> Apply to draft
              </AdminButton>
            </div>
            <p className="text-[11px] text-slate-400">
              The suggestion is only a starting point — it is applied to your draft and stays
              fully editable. Nothing is published automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Describe the brand and the AI will suggest a palette, typography, hero copy and
              section order. It is applied to your draft as an editable starting point —
              never auto-published.
            </p>
            <div>
              <AdminLabel>Business description</AdminLabel>
              <AdminTextarea
                value={aiBrief.description}
                onChange={(e) => setAiBrief((b) => ({ ...b, description: e.target.value }))}
                maxLength={400}
                rows={3}
                placeholder="What does the brand sell, and what makes it different?"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <AdminLabel>Target audience</AdminLabel>
                <AdminInput
                  value={aiBrief.audience}
                  onChange={(e) => setAiBrief((b) => ({ ...b, audience: e.target.value }))}
                  maxLength={200}
                  placeholder="e.g. Women 25–40 in major cities"
                />
              </div>
              <div>
                <AdminLabel>Desired mood</AdminLabel>
                <AdminInput
                  value={aiBrief.mood}
                  onChange={(e) => setAiBrief((b) => ({ ...b, mood: e.target.value }))}
                  maxLength={120}
                  placeholder="e.g. Warm, editorial, premium"
                />
              </div>
            </div>
            <div>
              <AdminLabel>Preferred colours (optional)</AdminLabel>
              <AdminInput
                value={aiBrief.preferredColors}
                onChange={(e) => setAiBrief((b) => ({ ...b, preferredColors: e.target.value }))}
                maxLength={120}
                placeholder="e.g. deep green with copper accents"
              />
            </div>
            <div className="flex justify-end gap-2">
              <AdminButton
                variant="secondary"
                onClick={() => {
                  setAiOpen(false);
                  setAiSuggestion(null);
                }}
              >
                Cancel
              </AdminButton>
              <AdminButton disabled={aiLoading} onClick={runAiSuggest}>
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Generate suggestion
              </AdminButton>
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  );
};

export default ShowcaseEditorPage;
