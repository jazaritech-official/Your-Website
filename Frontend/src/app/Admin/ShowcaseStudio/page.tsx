"use client";

/**
 * ============================================================
 * SHOWCASE STUDIO — profile list
 * ------------------------------------------------------------
 * Jazari Tech Official control plane: create, search, filter and
 * manage brand showcase profiles. Superadmin-only (enforced by
 * the Admin layout route guard + verifyAdmin on every API).
 * ============================================================
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  Copy,
  ExternalLink,
  Eye,
  Layers,
  Loader2,
  Archive,
  ArchiveRestore,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import { apiErrorMessage } from "@/app/utils/axiosError";
import { INDUSTRY_PRESETS, findIndustryPreset } from "@/config/industryPresets";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminModal,
  AdminPageHeader,
  AdminSelect,
} from "../components/adminUI";
import { STATUS_LABEL, STATUS_TONE, type ShowcaseProfile } from "./types";

const STATUSES = ["all", "draft", "published", "archived"] as const;

const ShowcaseStudioListPage = () => {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ShowcaseProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [industry, setIndustry] = useState<string>("all");

  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create-modal form
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newIndustry, setNewIndustry] = useState("general");
  const [newSlug, setNewSlug] = useState("");
  // F-presets: pre-create the preset's suggested homepage sections (empty
  // placeholders — filled later with real catalog picks, never invented).
  const [newStartSections, setNewStartSections] = useState(true);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${baseUrl}brand-profiles/admin`, {
        withCredentials: true,
        params: {
          page,
          limit: 20,
          q: search.trim() || undefined,
          status: status !== "all" ? status : undefined,
          industry: industry !== "all" ? industry : undefined,
        },
      });
      setProfiles(data?.data?.profiles || []);
      setTotal(data?.data?.pagination?.total ?? 0);
      setPages(data?.data?.pagination?.pages ?? 1);
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Failed to load showcases"), "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, industry]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const createShowcase = async () => {
    if (!newName.trim()) {
      showToast("Profile name is required", "error");
      return;
    }
    setBusyId("create");
    try {
      const { data } = await axios.post(
        `${baseUrl}brand-profiles/admin`,
        {
          name: newName.trim(),
          clientName: newClient.trim(),
          industry: newIndustry,
          slug: newSlug.trim() || undefined,
          sectionOrder: newStartSections
            ? findIndustryPreset(newIndustry).sectionOrder
            : undefined,
        },
        { withCredentials: true },
      );
      showToast("Showcase created", "success");
      setCreating(false);
      setNewName("");
      setNewClient("");
      setNewSlug("");
      router.push(`/Admin/ShowcaseStudio/${data?.data?.id}`);
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Failed to create showcase"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (id: string) => {
    setBusyId(id);
    try {
      await axios.post(`${baseUrl}brand-profiles/admin/${id}/duplicate`, {}, {
        withCredentials: true,
      });
      showToast("Showcase duplicated (draft copy)", "success");
      fetchProfiles();
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Failed to duplicate"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const setArchived = async (id: string, archived: boolean) => {
    setBusyId(id);
    try {
      await axios.post(
        `${baseUrl}brand-profiles/admin/${id}/${archived ? "archive" : "unarchive"}`,
        {},
        { withCredentials: true },
      );
      showToast(archived ? "Showcase archived" : "Showcase restored", "success");
      fetchProfiles();
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Action failed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Showcase Studio"
        subtitle={`Prepare industry-branded storefront demos for clients — ${total} profile${total === 1 ? "" : "s"}`}
        actions={
          <>
            <Link href="/Admin/PitchRecords">
              <AdminButton variant="secondary" size="sm">
                <Layers size={14} />
                Pitch Records
              </AdminButton>
            </Link>
            <AdminButton onClick={() => setCreating(true)} size="sm">
              <Plus size={14} />
              New Showcase
            </AdminButton>
          </>
        }
      />

      {/* Filters */}
      <AdminCard className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <AdminInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, slug or client…"
              className="pl-9"
            />
          </div>
          <AdminSelect
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : STATUS_LABEL[s] || s}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={industry}
            onChange={(e) => {
              setIndustry(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by industry"
          >
            <option value="all">All industries</option>
            {INDUSTRY_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminCard>

      {/* List */}
      {loading ? (
        <AdminCard className="flex items-center justify-center py-24">
          <Loader2 size={22} className="animate-spin text-slate-400" />
        </AdminCard>
      ) : profiles.length === 0 ? (
        <AdminCard className="py-20 text-center">
          <Sparkles size={26} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {search || status !== "all" || industry !== "all"
              ? "No showcases match these filters"
              : "No showcase profiles yet"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Create a profile to prepare a branded storefront for a client pitch.
          </p>
          {!search && status === "all" && industry === "all" && (
            <AdminButton className="mt-5" onClick={() => setCreating(true)} size="sm">
              <Plus size={14} /> Create the first showcase
            </AdminButton>
          )}
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => {
            const presetName =
              INDUSTRY_PRESETS.find((x) => x.id === p.industry)?.name || p.industry;
            return (
              <AdminCard key={p.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/Admin/ShowcaseStudio/${p.id}`}
                        className="truncate text-base font-bold text-slate-900 hover:text-[#0856DF]"
                      >
                        {p.name}
                      </Link>
                      <AdminBadge tone={STATUS_TONE[p.status] || "slate"}>
                        {STATUS_LABEL[p.status] || p.status}
                      </AdminBadge>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {p.config?.brandName || "—"}
                      {p.clientName ? ` · Client: ${p.clientName}` : ""} · {presetName}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                      /store/{p.slug}
                      {p.versions?.length ? ` · v${p.versions[0].version}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/Admin/ShowcaseStudio/${p.id}`}>
                      <AdminButton variant="secondary" size="sm">
                        Edit
                      </AdminButton>
                    </Link>
                    <Link href={`/Admin/ShowcaseStudio/${p.id}/preview`}>
                      <AdminButton variant="secondary" size="sm">
                        <Eye size={13} /> Preview
                      </AdminButton>
                    </Link>
                    {p.status === "published" && (
                      <a href={`/store/${p.slug}`} target="_blank" rel="noopener noreferrer">
                        <AdminButton variant="secondary" size="sm">
                          <ExternalLink size={13} /> Live
                        </AdminButton>
                      </a>
                    )}
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      disabled={busyId === p.id}
                      onClick={() => duplicate(p.id)}
                      title="Duplicate as a new draft"
                    >
                      {busyId === p.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Copy size={13} />
                      )}
                      Duplicate
                    </AdminButton>
                    {p.status === "archived" ? (
                      <AdminButton
                        variant="secondary"
                        size="sm"
                        disabled={busyId === p.id}
                        onClick={() => setArchived(p.id, false)}
                      >
                        <ArchiveRestore size={13} /> Restore
                      </AdminButton>
                    ) : (
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        disabled={busyId === p.id}
                        onClick={() => setArchived(p.id, true)}
                      >
                        <Archive size={13} /> Archive
                      </AdminButton>
                    )}
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <AdminButton
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </AdminButton>
          <span className="text-xs font-semibold text-slate-500">
            Page {page} of {pages}
          </span>
          <AdminButton
            variant="secondary"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </AdminButton>
        </div>
      )}

      {/* Create modal */}
      <AdminModal open={creating} onClose={() => setCreating(false)} title="Create Showcase">
        <div className="space-y-4">
          <div>
            <AdminLabel>Profile name *</AdminLabel>
            <AdminInput
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Anzara Studio — Fashion Demo"
              maxLength={100}
            />
          </div>
          <div>
            <AdminLabel>Client / company name</AdminLabel>
            <AdminInput
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
              placeholder="e.g. Anzara Studio"
              maxLength={120}
            />
          </div>
          <div>
            <AdminLabel>Industry preset</AdminLabel>
            <AdminSelect value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)}>
              {INDUSTRY_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </AdminSelect>
            <p className="mt-1.5 text-[11px] text-slate-400">
              The preset&apos;s palette and typography are one click away in the
              editor&apos;s Theme tab; the suggested homepage sections can be
              pre-created below — everything stays fully editable.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-slate-300">
            <input
              type="checkbox"
              checked={newStartSections}
              onChange={(e) => setNewStartSections(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]"
            />
            <span className="text-xs leading-snug text-slate-600">
              <span className="block text-sm font-semibold text-slate-800">
                Start with the preset&apos;s suggested homepage sections
              </span>
              Creates empty section placeholders in the preset&apos;s order — each is
              flagged until you fill it with real products/categories. No catalog
              data is ever invented.
            </span>
          </label>
          <div>
            <AdminLabel>Slug (optional)</AdminLabel>
            <AdminInput
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
              placeholder="auto-derived from the profile name"
              maxLength={60}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <AdminButton variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </AdminButton>
            <AdminButton onClick={createShowcase} disabled={busyId === "create"}>
              {busyId === "create" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create &amp; open editor
            </AdminButton>
          </div>
        </div>
      </AdminModal>
    </div>
  );
};

export default ShowcaseStudioListPage;
