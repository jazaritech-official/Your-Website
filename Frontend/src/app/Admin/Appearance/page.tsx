"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Type as TypeIcon,
} from "lucide-react";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import {
  applyThemeClientSide,
  cssVarsFromTokens,
  isValidHexColor,
  meetsSemanticContrast,
  resolveLogoUrl,
  type ThemeAdminPayload,
  type ThemeColors,
  type ThemePreset,
  type ThemeToken,
} from "@/app/utils/dynamicTheme";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminPageHeader,
  adminCx,
} from "../components/adminUI";

/* ===========================================================
   WEBSITE APPEARANCE — dynamic brand/theme customizer
   -----------------------------------------------------------
   Scope is deliberately limited to the curated brand tokens the
   backend exposes (Backend/utils/themeDefaults.js) plus the logo
   and site name/tagline. Fonts, spacing, layout and the Admin
   panel's own palette are explicitly out of scope.

   The page is styled with the ADMIN palette only — it never uses
   the customer theme tokens, so a poor customer colour choice can
   never make this screen (or the rest of the admin panel)
   unusable.
   =========================================================== */

/**
 * Result of asking the storefront to refresh its cached theme.
 *   live    — the public path now serves the value that was just saved
 *   pending — purge ran but the public read is still stale (will self-heal)
 *   failed  — the request itself did not succeed
 */
type StorefrontRefresh = "live" | "pending" | "failed";

/**
 * Ask the storefront to purge its ISR theme cache, then VERIFY the change is
 * actually visible to visitors.
 *
 * The admin session cookie cannot authorize this call: it is host-only to the
 * backend origin, so the browser never sends it to the frontend route. Instead
 * every theme write returns a short-lived `revalidateToken` which is passed
 * here as a Bearer header. Never report success unless the response says the
 * public path serves the saved version.
 */
const refreshStorefrontTheme = async (
  revalidateToken?: string,
  expectedUpdatedAt?: string | null,
): Promise<StorefrontRefresh> => {
  try {
    const res = await axios.post(
      "/api/theme/revalidate",
      { expectedUpdatedAt: expectedUpdatedAt || undefined },
      {
        withCredentials: true,
        headers: revalidateToken
          ? { Authorization: `Bearer ${revalidateToken}` }
          : undefined,
      },
    );
    if (res.data?.ok && res.data?.verified) return "live";
    if (res.data?.ok) return "pending";
    return "failed";
  } catch (err) {
    console.error("[Appearance] storefront theme revalidation failed:", err);
    return "failed";
  }
};

/** Honest, non-fatal feedback: the save succeeded, the refresh may not have. */
const notifyStorefrontRefresh = (
  status: StorefrontRefresh,
  action = "Theme saved",
) => {
  if (status === "live") {
    showToast(`${action} — live on the storefront`, "success");
    return;
  }
  if (status === "pending") {
    showToast(
      `${action}, but the storefront is still serving the previous version — it will refresh within 5 minutes.`,
      "warn",
    );
    return;
  }
  showToast(
    `${action}, but the storefront cache could not be refreshed automatically — it will update within 5 minutes.`,
    "warn",
  );
};

/** The native colour input only understands #rrggbb — normalise for it. */
const toPickerHex = (value: string): string => {
  const v = (value || "").trim().replace("#", "");
  if (/^[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  }
  if (/^[0-9a-fA-F]{8}$/.test(v)) return `#${v.slice(0, 6)}`;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  return "#000000";
};

const AppearancePage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [registry, setRegistry] = useState<ThemeToken[]>([]);
  /* Curated palettes served by the backend (see Backend/utils/themePresets.js). */
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [defaults, setDefaults] = useState<ThemeAdminPayload["defaults"] | null>(
    null,
  );

  // Working (possibly unsaved) form state
  const [colors, setColors] = useState<ThemeColors>({});
  const [siteName, setSiteName] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Last-saved snapshot, for dirty detection
  const [saved, setSaved] = useState<{
    colors: ThemeColors;
    siteName: string;
    tagline: string;
  } | null>(null);

  const [invalidToken, setInvalidToken] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${baseUrl}theme/admin`, {
        withCredentials: true,
      });
      const data: ThemeAdminPayload | undefined = res.data?.data;
      if (!data) throw new Error("Empty theme payload");
      setRegistry(Array.isArray(data.registry) ? data.registry : []);
      setPresets(Array.isArray(data.presets) ? data.presets : []);
      setDefaults(data.defaults || null);
      setColors({ ...(data.theme?.colors || {}) });
      setSiteName(data.theme?.siteName || "");
      setTagline(data.theme?.tagline || "");
      setLogoUrl(data.theme?.logoUrl || "");
      setSaved({
        colors: { ...(data.theme?.colors || {}) },
        siteName: data.theme?.siteName || "",
        tagline: data.theme?.tagline || "",
      });
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && typeof err.response?.data?.message === "string"
          ? err.response.data.message
          : "Could not load the theme settings";
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Unsaved values as cssVars — drives the live preview. */
  const previewVars = useMemo(
    () => cssVarsFromTokens(registry, colors),
    [registry, colors],
  );

  const isDirty = useMemo(() => {
    if (!saved) return false;
    if (siteName !== saved.siteName || tagline !== saved.tagline) return true;
    return registry.some(
      (t) => (colors[t.apiKey] || "") !== (saved.colors[t.apiKey] || ""),
    );
  }, [saved, registry, colors, siteName, tagline]);

  /*
   * Which preset (if any) the working colours currently match exactly.
   * Purely derived — selecting a preset does nothing but write `colors`, so
   * this stays correct when the admin fine-tunes an individual token
   * afterwards (the preset simply stops being highlighted).
   */
  const activePresetId = useMemo(() => {
    if (!registry.length || !presets.length) return null;
    const same = (a?: string, b?: string) =>
      (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
    return (
      presets.find((preset) =>
        registry.every((token) =>
          same(
            colors[token.apiKey],
            preset.colors[token.apiKey] ?? token.default,
          ),
        ),
      )?.id ?? null
    );
  }, [registry, presets, colors]);

  /**
   * Apply a palette: fills every colour field at once. No request is made and
   * nothing is persisted — the existing "Save Changes" button does that, and
   * `previewVars` re-derives the live preview automatically.
   */
  const applyPreset = (preset: ThemePreset) => {
    setColors((prev) => ({ ...prev, ...preset.colors }));
    setInvalidToken(null);
  };

  // Group tokens for display
  const grouped = useMemo(() => {
    const map = new Map<string, ThemeToken[]>();
    for (const token of registry) {
      const list = map.get(token.group) || [];
      list.push(token);
      map.set(token.group, list);
    }
    return Array.from(map.entries());
  }, [registry]);

  const setTokenValue = (apiKey: string, value: string) => {
    setColors((prev) => ({ ...prev, [apiKey]: value }));
    if (isValidHexColor(value)) setInvalidToken(null);
  };

  const validateAll = (): boolean => {
    for (const token of registry) {
      if (!isValidHexColor(colors[token.apiKey])) {
        setInvalidToken(token.apiKey);
        showToast(`"${token.label}" needs a valid hex colour`, "error");
        return false;
      }
      // F-11: semantic status tokens must stay accessible — the same
      // 3:1-vs-white rule the backend enforces, surfaced BEFORE the request.
      if (token.group === "Status" && !meetsSemanticContrast(colors[token.apiKey])) {
        setInvalidToken(token.apiKey);
        showToast(
          `"${token.label}" must keep at least 3:1 contrast against white so status badges stay accessible`,
          "error",
        );
        return false;
      }
    }
    if (!siteName.trim()) {
      showToast("Site name cannot be empty", "error");
      return false;
    }
    setInvalidToken(null);
    return true;
  };

  const handleSave = async () => {
    if (saving || !validateAll()) return;
    setSaving(true);
    try {
      const res = await axios.put(
        `${baseUrl}theme/admin`,
        { colors, siteName: siteName.trim(), tagline: tagline.trim() },
        { withCredentials: true },
      );
      const updated = res.data?.data;
      if (updated?.colors) setColors({ ...updated.colors });
      setSaved({
        colors: { ...(updated?.colors || colors) },
        siteName: updated?.siteName ?? siteName.trim(),
        tagline: updated?.tagline ?? tagline.trim(),
      });

      // Apply instantly in this tab, then expire the ISR cache so every
      // other visitor's next page load shows the new branding too. Success is
      // only reported once the public path is verified to serve the new value.
      applyThemeClientSide(cssVarsFromTokens(registry, updated?.colors || colors));
      const refresh = await refreshStorefrontTheme(
        updated?.revalidateToken,
        updated?.updatedAt,
      );
      notifyStorefrontRefresh(refresh);
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && typeof err.response?.data?.message === "string"
          ? err.response.data.message
          : "Could not save the theme";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  // Resets the FORM to the platform defaults (applied to the preview so the
  // Admin can review before publishing). Nothing is persisted until Save, so
  // a mis-click can never destroy a configured palette.
  const handleReset = () => {
    if (!defaults) return;
    setColors({ ...defaults.colors });
    setSiteName(defaults.siteName);
    setTagline(defaults.tagline);
    setInvalidToken(null);
    showToast("Defaults restored — click Save Changes to publish", "info");
  };

  const handleLogoUpload = async (file: File) => {
    if (uploadingLogo) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file", "error");
      return;
    }
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await axios.post(`${baseUrl}theme/admin/logo`, form, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = res.data?.data;
      setLogoUrl(data?.logoUrl || "");
      const refresh = await refreshStorefrontTheme(
        data?.revalidateToken,
        data?.updatedAt,
      );
      notifyStorefrontRefresh(refresh, "Logo updated");
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && typeof err.response?.data?.message === "string"
          ? err.response.data.message
          : "Logo upload failed";
      showToast(message, "error");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleLogoRemove = async () => {
    if (uploadingLogo) return;
    setUploadingLogo(true);
    try {
      const res = await axios.delete(`${baseUrl}theme/admin/logo`, {
        withCredentials: true,
      });
      setLogoUrl("");
      const data = res.data?.data;
      const refresh = await refreshStorefrontTheme(
        data?.revalidateToken,
        data?.updatedAt,
      );
      notifyStorefrontRefresh(refresh, "Custom logo removed");
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && typeof err.response?.data?.message === "string"
          ? err.response.data.message
          : "Could not remove the logo";
      showToast(message, "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#0856DF]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Website Appearance"
        subtitle="Control the storefront's brand colours, logo and site name — no code deployment needed."
        actions={
          <>
            <AdminButton
              variant="secondary"
              onClick={handleReset}
              disabled={!defaults || saving}
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Defaults
            </AdminButton>
            <AdminButton onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save Changes"}
            </AdminButton>
          </>
        }
      />

      {isDirty && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
        >
          You have unsaved changes. The live preview on the right shows how the
          storefront will look once you save.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ───────────────── Controls ───────────────── */}
        <div className="space-y-6">
          {/*
            Choose a Palette — a fast way to fill in the SAME colour fields the
            individual pickers below write. Clicking one does NOT save; it
            updates the fields and the live preview so the admin can inspect and
            fine-tune before committing with Save Changes.
          */}
          {presets.length > 0 && (
            <AdminCard className="p-5">
              <div className="mb-1 flex items-center gap-2">
                <Palette className="h-4 w-4 text-[#0856DF]" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                  Choose a Palette
                </h2>
              </div>
              <p className="mb-4 text-xs text-slate-500">
                Pick a starting point — it fills in every colour below. You can
                still fine-tune individual colours before saving.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {presets.map((preset) => {
                  const isActive = activePresetId === preset.id;
                  const c = preset.colors;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      aria-pressed={isActive}
                      className={`rounded-xl border p-3 text-left transition ${
                        isActive
                          ? "border-[#0856DF] ring-2 ring-[#0856DF]/25"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {/* Mini storefront sample rendered in THIS palette. */}
                      <div
                        className="mb-2 overflow-hidden rounded-lg"
                        style={{ background: c.surfacePage }}
                      >
                        <div
                          className="flex items-center justify-between px-2.5 py-1.5"
                          style={{ background: c.brandNavy }}
                        >
                          <span
                            className="text-[9px] font-black uppercase tracking-[0.14em]"
                            style={{ color: c.brandGold }}
                          >
                            {siteName || "Irhas'Inn"}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[8px] font-bold"
                            style={{
                              background: c.brandGold,
                              color: c.brandNavyDeep,
                            }}
                          >
                            Sale
                          </span>
                        </div>
                        <div
                          className="space-y-1 border-x border-b p-2.5"
                          style={{
                            background: c.surfaceCard,
                            borderColor: c.line,
                          }}
                        >
                          <div
                            className="h-1.5 w-2/3 rounded-full"
                            style={{ background: c.ink }}
                          />
                          <div
                            className="h-1.5 w-1/2 rounded-full"
                            style={{ background: c.inkMuted }}
                          />
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span
                              className="rounded px-1.5 py-0.5 text-[8px] font-bold"
                              style={{
                                background: c.stateSuccess,
                                color: "#FFFFFF",
                              }}
                            >
                              Delivered
                            </span>
                            <span
                              className="text-[9px] font-bold"
                              style={{ color: c.ink }}
                            >
                              Rs 2,450
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          {preset.name}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-[#0856DF]">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </AdminCard>
          )}

          {grouped.map(([group, tokens]) => (
            <AdminCard key={group} className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Palette className="h-4 w-4 text-[#0856DF]" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                  {group}
                </h2>
              </div>
              {group === "Status" && (
                <p className="mb-4 text-xs text-slate-500">
                  Functional signals — keep at least 3:1 contrast against
                  white so status badges stay accessible.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {tokens.map((token) => {
                  const value = colors[token.apiKey] || token.default;
                  const invalid = invalidToken === token.apiKey;
                  return (
                    <div key={token.apiKey}>
                      <AdminLabel>{token.label}</AdminLabel>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={`${token.label} colour picker`}
                          value={toPickerHex(value)}
                          onChange={(e) =>
                            setTokenValue(token.apiKey, e.target.value)
                          }
                          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                        />
                        <AdminInput
                          value={value}
                          spellCheck={false}
                          aria-label={`${token.label} hex value`}
                          aria-invalid={invalid || undefined}
                          onChange={(e) => setTokenValue(token.apiKey, e.target.value)}
                          className={adminCx(
                            "font-mono uppercase",
                            invalid && "border-red-400 focus:border-red-500",
                          )}
                        />
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-slate-400">
                        {token.cssVar}
                      </p>
                    </div>
                  );
                })}
              </div>
            </AdminCard>
          ))}

          {/* Branding: logo + name/tagline */}
          <AdminCard className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-[#0856DF]" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Logo
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveLogoUrl(logoUrl)}
                  alt="Current logo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                  }}
                />
                <AdminButton
                  variant="secondary"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {logoUrl ? "Replace logo" : "Upload logo"}
                </AdminButton>
                {logoUrl && (
                  <AdminButton
                    variant="ghost"
                    onClick={handleLogoRemove}
                    disabled={uploadingLogo}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </AdminButton>
                )}
              </div>
              <p className="w-full text-xs text-slate-500">
                Shown in the header, footer, checkout and first-load splash. Saves
                immediately on upload. Max 4MB.
              </p>
            </div>
          </AdminCard>

          <AdminCard className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <TypeIcon className="h-4 w-4 text-[#0856DF]" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Site identity
              </h2>
            </div>
            <div className="grid gap-4">
              <div>
                <AdminLabel>Site name</AdminLabel>
                <AdminInput
                  value={siteName}
                  maxLength={60}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="Irhas'Inn"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Used in the page title, social share cards and the header
                  wordmark.
                </p>
              </div>
              <div>
                <AdminLabel>Tagline</AdminLabel>
                <AdminInput
                  value={tagline}
                  maxLength={120}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Customize Product All In One"
                />
              </div>
            </div>
          </AdminCard>
        </div>

        {/* ───────────────── Live preview ───────────────── */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          <AdminCard className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
              <Moon className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800">
                Live preview
              </h2>
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {isDirty ? "Unsaved" : "Saved"}
              </span>
            </div>

            {/*
              The preview scope: the unsaved token values are set as inline CSS
              custom properties on this wrapper, so the REAL storefront token
              utilities below resolve to them. Nothing outside this box is
              affected, and nothing is persisted by moving these values.
            */}
            <div
              className="space-y-4 p-5"
              style={previewVars as React.CSSProperties}
            >
              {/* Mini header */}
              <div className="flex items-center justify-between rounded-field bg-brand-navy px-4 py-3">
                <span className="text-sm font-black uppercase tracking-[0.15em] text-brand-gold">
                  {siteName || "Irhas'Inn"}
                </span>
                <span className="rounded-full bg-brand-gold px-2.5 py-1 text-[10px] font-bold text-brand-navy-deep">
                  Cart
                </span>
              </div>

              {/* Card */}
              <div className="rounded-card border border-line bg-surface p-4 shadow-card">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold text-brand-navy">
                    Example Product
                  </p>
                  <span className="rounded-full bg-state-danger px-2 py-0.5 text-[10px] font-bold text-white">
                    -20%
                  </span>
                </div>
                <p className="text-xs text-ink-muted">
                  Sample body copy in the secondary text colour.
                </p>
                <p className="mt-1 text-[11px] text-ink-subtle">
                  Tertiary text / helper copy.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    tabIndex={-1}
                    className="rounded-field bg-brand-gold px-3.5 py-2 text-xs font-bold text-brand-navy-deep"
                  >
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    className="rounded-field bg-brand-navy px-3.5 py-2 text-xs font-bold text-white"
                  >
                    Buy Now
                  </button>
                  <span className="ml-auto text-sm font-bold text-brand-navy">
                    Rs 1,999
                  </span>
                </div>
              </div>

              {/* Status pills + surfaces */}
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["In Stock", "bg-state-success"],
                    ["Low Stock", "bg-state-warning"],
                    ["Sold Out", "bg-state-danger"],
                    ["Info", "bg-state-info"],
                  ] as const
                ).map(([label, cls]) => (
                  <span
                    key={label}
                    className={`rounded-full ${cls} px-2.5 py-1 text-[10px] font-bold text-white`}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="rounded-field bg-surface-page p-3">
                <p className="text-[11px] font-semibold text-ink-muted">
                  Page background
                </p>
                <div className="mt-2 flex gap-2">
                  <div className="h-8 flex-1 rounded-field bg-surface shadow-sm" />
                  <div className="h-8 flex-1 rounded-field bg-surface-muted" />
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-gold-hover">
                <Check className="h-3.5 w-3.5" />
                Accent hover / link colour
              </div>
            </div>
          </AdminCard>

          <p className="mt-3 px-1 text-xs text-slate-500">
            Changes apply site-wide (header, footer, buttons, badges, prices,
            backgrounds) on the next page load for every visitor.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AppearancePage;
