"use client";

/**
 * ============================================================
 * SHOWCASE STUDIO — DRAFT PREVIEW
 * ------------------------------------------------------------
 * Authenticated preview of a showcase's DRAFT configuration,
 * rendered through the exact same ShowcaseHome renderer the
 * public /store/[slug] route uses, so what the operator sees
 * here is what visitors will get after publishing.
 *
 * THEME SCOPING: the brand CSS variables are applied to a
 * wrapper element (CSS custom properties cascade to
 * descendants) instead of html:root, so the surrounding Admin
 * chrome keeps its own palette and a poor draft colour choice
 * can never make this screen unusable.
 *
 * DRAFT DATA NEVER LEAKS: this page reads only the
 * admin-only preview-config endpoint; the public endpoint
 * serves published copies exclusively.
 * ============================================================
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import axios from "axios";
import { ArrowLeft, Eye, Rocket } from "lucide-react";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import { apiErrorMessage } from "@/app/utils/axiosError";
import ShowcaseHome from "@/app/Components/showcase/ShowcaseHome";
import type { ShowcasePublicConfig } from "@/app/utils/showcase";
import {
  AdminBadge,
  AdminButton,
  AdminLoading,
  adminCx,
} from "../../../components/adminUI";
import { STATUS_LABEL, STATUS_TONE } from "../../types";

/** CSSProperties with custom properties (--color-*) allowed. */
type ScopedThemeStyle = React.CSSProperties & Record<string, string>;

const ShowcasePreviewPage = () => {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ShowcasePublicConfig | null>(null);
  const [status, setStatus] = useState<string>("draft");
  const [slug, setSlug] = useState<string>("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(
        `${baseUrl}brand-profiles/admin/${id}/preview-config`,
        { withCredentials: true },
      );
      setConfig(data?.data || null);
      setStatus(data?.data?.status || "draft");
      setSlug(data?.data?.slug || "");
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Failed to load preview"), "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !config) {
    return (
      <div className="flex flex-col items-center gap-4">
        <AdminLoading message="Rendering draft preview…" />
        {!loading && !config && (
          <Link href="/Admin/ShowcaseStudio">
            <AdminButton variant="secondary" size="sm">Back to Showcase Studio</AdminButton>
          </Link>
        )}
      </div>
    );
  }

  const scopedTheme: ScopedThemeStyle = {
    ...(config.theme?.cssVars || {}),
    // Contain the preview so fixed elements (watermark) stay inside it.
    position: "relative",
  };

  return (
    <div className="space-y-4">
      {/* Preview chrome — admin-controlled, never part of the brand render. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/Admin/ShowcaseStudio/${id}`}>
            <AdminButton variant="secondary" size="sm">
              <ArrowLeft size={13} /> Back to editor
            </AdminButton>
          </Link>
          <span className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <Eye size={15} />
            Draft preview
            <AdminBadge tone={STATUS_TONE[status] || "slate"}>
              {STATUS_LABEL[status] || status}
            </AdminBadge>
          </span>
          {slug && <span className="font-mono text-xs text-amber-700">/store/{slug}</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* Device width toggle */}
          <div className="flex items-center rounded-xl border border-amber-300 bg-white p-0.5">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                className={adminCx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition",
                  device === d
                    ? "bg-amber-600 text-white"
                    : "text-amber-700 hover:bg-amber-50",
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <Link href={`/Admin/ShowcaseStudio/${id}#publish`}>
            <AdminButton variant="success" size="sm">
              <Rocket size={13} /> Publish
            </AdminButton>
          </Link>
        </div>
      </div>

      {/* The real storefront renderer, scoped to the brand tokens. */}
      <div
        className={adminCx(
          "mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
          device === "mobile" ? "max-w-[420px]" : "max-w-full",
        )}
        style={scopedTheme}
      >
        <ShowcaseHome config={config} />
      </div>
    </div>
  );
};

export default ShowcasePreviewPage;
