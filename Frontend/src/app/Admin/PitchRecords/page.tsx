"use client";

/**
 * ============================================================
 * PITCH RECORDS — LIST
 * ------------------------------------------------------------
 * Internal sales records for the Jazari Tech Official control
 * plane: which demo showcase was prepared for which client,
 * what was demonstrated, and what happened. Admin-only — there
 * is no public endpoint for these records (internal notes are
 * private by construction).
 * ============================================================
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  CalendarClock,
  Layers,
  Loader2,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import { apiErrorMessage } from "@/app/utils/axiosError";
import { INDUSTRY_PRESETS } from "@/config/industryPresets";
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
import {
  PITCH_STATUS_LABEL,
  PITCH_STATUS_TONE,
  type PitchRecord,
} from "./pitchTypes";

const STATUS_FILTERS = [
  "all",
  "draft",
  "preparing",
  "ready",
  "presented",
  "followup",
  "won",
  "lost",
  "archived",
] as const;

const PitchRecordsListPage = () => {
  const router = useRouter();
  const [records, setRecords] = useState<PitchRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [industry, setIndustry] = useState<string>("all");

  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newClient, setNewClient] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newIndustry, setNewIndustry] = useState("general");

  // "Now" is stamped inside the fetch callback (an async context, not render)
  // so the follow-up-due highlight is stable and lint-clean.
  const [now, setNow] = useState(() => Date.now());

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${baseUrl}pitch-records/admin`, {
        withCredentials: true,
        params: {
          page,
          limit: 20,
          q: search.trim() || undefined,
          status: status !== "all" ? status : undefined,
          industry: industry !== "all" ? industry : undefined,
        },
      });
      setRecords(data?.data?.records || []);
      setTotal(data?.data?.pagination?.total ?? 0);
      setPages(data?.data?.pagination?.pages ?? 1);
      setCounts(data?.data?.counts || {});
      setNow(Date.now());
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Failed to load pitch records"), "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, industry]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const createRecord = async () => {
    if (!newClient.trim()) {
      showToast("Client name is required", "error");
      return;
    }
    setBusy(true);
    try {
      const { data } = await axios.post(
        `${baseUrl}pitch-records/admin`,
        {
          clientName: newClient.trim(),
          pitchTitle: newTitle.trim(),
          industry: newIndustry,
        },
        { withCredentials: true },
      );
      showToast("Pitch record created", "success");
      setCreating(false);
      setNewClient("");
      setNewTitle("");
      router.push(`/Admin/PitchRecords/${data?.data?.id}`);
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Failed to create record"), "error");
    } finally {
      setBusy(false);
    }
  };

  // Pure date helpers — "now" is passed in (captured via useMemo above).
  const formatDate = (v: string | null) =>
    v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

  const followUpDue = (v: string | null) => {
    if (!v) return false;
    const due = new Date(v).getTime();
    return due <= now + 7 * 24 * 60 * 60 * 1000;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Pitch Records"
        subtitle={`Internal sales records — ${total} record${total === 1 ? "" : "s"}`}
        actions={
          <>
            <Link href="/Admin/ShowcaseStudio">
              <AdminButton variant="secondary" size="sm">
                <Layers size={14} /> Showcase Studio
              </AdminButton>
            </Link>
            <AdminButton onClick={() => setCreating(true)} size="sm">
              <Plus size={14} /> New record
            </AdminButton>
          </>
        }
      />

      {/* Status counters — real counts from the backend aggregation. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {STATUS_FILTERS.filter((s) => s !== "all").map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(status === s ? "all" : s);
              setPage(1);
            }}
            className={
              "rounded-2xl border px-3 py-3 text-left transition " +
              (status === s
                ? "border-[#0856DF] bg-[#0856DF]/5 ring-1 ring-[#0856DF]/30"
                : "border-slate-200 bg-white hover:border-slate-300")
            }
          >
            <p className="text-lg font-black text-slate-900">{counts[s] || 0}</p>
            <p className="truncate text-[11px] font-semibold text-slate-500">
              {PITCH_STATUS_LABEL[s] || s}
            </p>
          </button>
        ))}
      </div>

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
              placeholder="Search client, title or slug…"
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
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : PITCH_STATUS_LABEL[s] || s}
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
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </AdminSelect>
        </div>
      </AdminCard>

      {/* List */}
      {loading ? (
        <AdminCard className="flex items-center justify-center py-24">
          <Loader2 size={22} className="animate-spin text-slate-400" />
        </AdminCard>
      ) : records.length === 0 ? (
        <AdminCard className="py-20 text-center">
          <Sparkles size={26} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {search || status !== "all" || industry !== "all"
              ? "No records match these filters"
              : "No pitch records yet"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Record every client pitch: the demo prepared, what was shown, and the outcome.
          </p>
          {!search && status === "all" && industry === "all" && (
            <AdminButton className="mt-5" onClick={() => setCreating(true)} size="sm">
              <Plus size={14} /> Create the first record
            </AdminButton>
          )}
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <AdminCard key={r.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/Admin/PitchRecords/${r.id}`}
                      className="truncate text-base font-bold text-slate-900 hover:text-[#0856DF]"
                    >
                      {r.clientName}
                      {r.pitchTitle ? ` — ${r.pitchTitle}` : ""}
                    </Link>
                    <AdminBadge tone={PITCH_STATUS_TONE[r.status] || "slate"}>
                      {PITCH_STATUS_LABEL[r.status] || r.status}
                    </AdminBadge>
                    {r.configVersion != null && (
                      <AdminBadge tone="violet">v{r.configVersion}</AdminBadge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {r.profileNameSnapshot
                      ? `${r.profileNameSnapshot} (${r.profileSlug || "unlinked"})`
                      : "No showcase linked"}
                    {r.presentedAt ? ` · Presented ${formatDate(r.presentedAt)}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {r.followUpAt && (
                    <span
                      className={
                        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold " +
                        (followUpDue(r.followUpAt)
                          ? "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
                          : "bg-slate-100 text-slate-600")
                      }
                    >
                      <CalendarClock size={12} />
                      Follow-up {formatDate(r.followUpAt)}
                    </span>
                  )}
                  <Link href={`/Admin/PitchRecords/${r.id}`}>
                    <AdminButton variant="secondary" size="sm">Open</AdminButton>
                  </Link>
                </div>
              </div>
            </AdminCard>
          ))}
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
      <AdminModal open={creating} onClose={() => setCreating(false)} title="New Pitch Record">
        <div className="space-y-4">
          <div>
            <AdminLabel>Client name *</AdminLabel>
            <AdminInput
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
              placeholder="e.g. Anzara Studio"
              maxLength={120}
            />
          </div>
          <div>
            <AdminLabel>Pitch title</AdminLabel>
            <AdminInput
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Women's fashion storefront demo"
              maxLength={140}
            />
          </div>
          <div>
            <AdminLabel>Industry</AdminLabel>
            <AdminSelect value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)}>
              {INDUSTRY_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </AdminSelect>
          </div>
          <p className="text-[11px] text-slate-400">
            You can link a showcase profile and record demonstrated features from the record page.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <AdminButton variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </AdminButton>
            <AdminButton onClick={createRecord} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create record
            </AdminButton>
          </div>
        </div>
      </AdminModal>
    </div>
  );
};

export default PitchRecordsListPage;
