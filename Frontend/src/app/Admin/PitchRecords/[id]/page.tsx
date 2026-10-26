"use client";

/**
 * ============================================================
 * PITCH RECORD — DETAIL / EDIT
 * ------------------------------------------------------------
 * Full editor for one internal pitch record. Everything the
 * backend whitelists is editable here: status workflow, linked
 * showcase profile (snapshotted for archival safety), the
 * configured-interfaces and demonstrated-features checklists,
 * presentation/follow-up dates and the private notes fields.
 *
 * PRIVACY: internalNotes/outcomeNotes are edited and stored on
 * admin-only endpoints — no public API ever returns them.
 * ============================================================
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Layers,
  Loader2,
  Save,
  Sparkles,
  Trash2,
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
  AdminLoading,
  AdminModal,
  AdminPageHeader,
  AdminSelect,
  AdminTextarea,
} from "../../components/adminUI";
import {
  FEATURE_LABELS,
  INTERFACE_LABELS,
  PITCH_STATUS_LABEL,
  PITCH_STATUS_TONE,
  type PitchRecord,
} from "../pitchTypes";

/* Whitelists — keep in sync with Backend/Models/PitchRecord.js. */
const STATUSES = [
  "draft",
  "preparing",
  "ready",
  "presented",
  "followup",
  "won",
  "lost",
  "archived",
] as const;

const INTERFACES = Object.keys(INTERFACE_LABELS);
const FEATURES = Object.keys(FEATURE_LABELS);

/** Showcase profile option for the link picker. */
interface ProfileOption {
  id: string;
  name: string;
  slug: string;
  industry: string;
  status: string;
}

/** HTML date input value from an ISO string ("" when unset). */
const toDateInput = (v: string | null): string => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const PitchRecordDetailPage = () => {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<PitchRecord | null>(null);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* Showcase-link picker — server-side search + pagination, so profiles
     beyond the first page are reachable and the linked profile is never
     filtered out of sight by a search. */
  const [profileQuery, setProfileQuery] = useState("");
  const [profilePage, setProfilePage] = useState(1);
  const [profilePages, setProfilePages] = useState(1);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [linkedFallback, setLinkedFallback] = useState<ProfileOption | null>(null);
  const fetchedProfileQuery = useRef("");
  const resolvedLinkedId = useRef<string | null>(null);
  const profileSeq = useRef(0);

  /* Form state */
  const [form, setForm] = useState({
    clientName: "",
    pitchTitle: "",
    industry: "general",
    status: "draft",
    showcaseProfileId: "",
    selectedPreset: "",
    customizationSummary: "",
    internalNotes: "",
    outcomeNotes: "",
    presentedAt: "",
    followUpAt: "",
    configuredInterfaces: [] as string[],
    demonstratedFeatures: [] as string[],
  });

  /** Profile picker list — page 1 replaces, later pages append (deduped).
      A sequence guard drops out-of-order responses from rapid searches. */
  const fetchProfiles = useCallback(async (q: string, page: number) => {
    const seq = ++profileSeq.current;
    setProfilesLoading(true);
    try {
      const { data } = await axios.get(`${baseUrl}brand-profiles/admin`, {
        withCredentials: true,
        params: { page, limit: 50, ...(q ? { q } : {}) },
      });
      if (seq !== profileSeq.current) return; // superseded by a newer fetch
      const items: ProfileOption[] = data?.data?.profiles || [];
      setProfiles((prev) =>
        page <= 1
          ? items
          : [...prev, ...items.filter((i) => !prev.some((p) => p.id === i.id))],
      );
      setProfilePage(page);
      setProfilePages(data?.data?.pagination?.pages ?? 1);
    } catch (err: unknown) {
      if (seq === profileSeq.current) {
        showToast(apiErrorMessage(err, "Failed to load showcase profiles"), "error");
      }
    } finally {
      if (seq === profileSeq.current) setProfilesLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rec } = await axios.get(`${baseUrl}pitch-records/admin/${id}`, {
        withCredentials: true,
      });
      const r: PitchRecord = rec?.data;
      setRecord(r);
      setForm({
        clientName: r.clientName || "",
        pitchTitle: r.pitchTitle || "",
        industry: r.industry || "general",
        status: r.status || "draft",
        showcaseProfileId: r.showcaseProfile || "",
        selectedPreset: r.selectedPreset || "",
        customizationSummary: r.customizationSummary || "",
        internalNotes: r.internalNotes || "",
        outcomeNotes: r.outcomeNotes || "",
        presentedAt: toDateInput(r.presentedAt),
        followUpAt: toDateInput(r.followUpAt),
        configuredInterfaces: r.configuredInterfaces || [],
        demonstratedFeatures: r.demonstratedFeatures || [],
      });
      setDirty(false);
      void fetchProfiles(profileQuery.trim(), 1);
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Failed to load pitch record"), "error");
    } finally {
      setLoading(false);
    }
  }, [id, fetchProfiles, profileQuery]);

  useEffect(() => {
    load();
  }, [load]);

  /* Debounced profile search (page 1 only). load() already fetches the
     empty query on mount, so that run is skipped. */
  useEffect(() => {
    const q = profileQuery.trim();
    if (fetchedProfileQuery.current === q) return;
    const t = setTimeout(() => {
      fetchedProfileQuery.current = q;
      void fetchProfiles(q, 1);
    }, 300);
    return () => clearTimeout(t);
  }, [profileQuery, fetchProfiles]);

  /* The linked profile may sit outside the loaded page — or be filtered out
     of the list by the search — so resolve it directly by id once and keep
     the link card visible regardless of what the picker currently shows.
     Clearing on link change happens in patch(); this effect only ever sets
     state from the async fetch callback. */
  useEffect(() => {
    const linkedId = form.showcaseProfileId;
    if (!linkedId || profiles.some((p) => p.id === linkedId)) return;
    if (resolvedLinkedId.current === linkedId) return; // already tried
    let cancelled = false;
    axios
      .get(`${baseUrl}brand-profiles/admin/${linkedId}`, { withCredentials: true })
      .then(({ data }) => {
        if (cancelled) return;
        const p: ProfileOption | undefined = data?.data;
        setLinkedFallback(p?.id ? p : null);
        resolvedLinkedId.current = linkedId;
      })
      .catch(() => {
        // Profile gone — record it so the effect stops retrying.
        if (!cancelled) resolvedLinkedId.current = linkedId;
      });
    return () => {
      cancelled = true;
    };
  }, [form.showcaseProfileId, profiles]);

  const patch = (updates: Partial<typeof form>) => {
    if ("showcaseProfileId" in updates) {
      // A new link invalidates the cached link-card lookup; the resolution
      // effect below refetches it asynchronously if it is not in the list.
      setLinkedFallback(null);
      resolvedLinkedId.current = null;
    }
    setForm((f) => ({ ...f, ...updates }));
    setDirty(true);
  };

  const toggleIn = (key: "configuredInterfaces" | "demonstratedFeatures", value: string) =>
    patch({
      [key]: form[key].includes(value)
        ? form[key].filter((x) => x !== value)
        : [...form[key], value],
    } as Partial<typeof form>);

  const save = async (): Promise<boolean> => {
    if (!form.clientName.trim()) {
      showToast("Client name is required", "error");
      return false;
    }
    setSaving(true);
    try {
      const { data } = await axios.put(
        `${baseUrl}pitch-records/admin/${id}`,
        {
          clientName: form.clientName.trim(),
          pitchTitle: form.pitchTitle.trim(),
          industry: form.industry,
          status: form.status,
          showcaseProfileId: form.showcaseProfileId || "",
          selectedPreset: form.selectedPreset.trim(),
          customizationSummary: form.customizationSummary,
          internalNotes: form.internalNotes,
          outcomeNotes: form.outcomeNotes,
          presentedAt: form.presentedAt || null,
          followUpAt: form.followUpAt || null,
          configuredInterfaces: form.configuredInterfaces,
          demonstratedFeatures: form.demonstratedFeatures,
        },
        { withCredentials: true },
      );
      setRecord(data?.data);
      setDirty(false);
      showToast("Pitch record saved", "success");
      return true;
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Save failed"), "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await axios.delete(`${baseUrl}pitch-records/admin/${id}`, { withCredentials: true });
      showToast("Pitch record deleted", "success");
      router.push("/Admin/PitchRecords");
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, "Delete failed"), "error");
    } finally {
      setDeleting(false);
    }
  };

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

  if (loading || !record) {
    return (
      <div className="flex flex-col items-center gap-4">
        <AdminLoading message="Loading pitch record…" />
        {!loading && !record && (
          <Link href="/Admin/PitchRecords">
            <AdminButton variant="secondary" size="sm">Back to Pitch Records</AdminButton>
          </Link>
        )}
      </div>
    );
  }

  const linkedProfile =
    profiles.find((p) => p.id === form.showcaseProfileId) ||
    (linkedFallback?.id === form.showcaseProfileId ? linkedFallback : null);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={record.clientName || "Pitch record"}
        subtitle={`Created ${new Date(record.createdAt).toLocaleDateString()}`}
        actions={
          <>
            <Link href="/Admin/PitchRecords">
              <AdminButton variant="ghost" size="sm">
                <ArrowLeft size={13} /> All records
              </AdminButton>
            </Link>
            <AdminButton variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={13} /> Delete
            </AdminButton>
            <AdminButton size="sm" disabled={saving} onClick={save}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </AdminButton>
          </>
        }
      />

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-2">
        <AdminBadge tone={PITCH_STATUS_TONE[record.status] || "slate"}>
          {PITCH_STATUS_LABEL[record.status] || record.status}
        </AdminBadge>
        {record.configVersion != null && (
          <AdminBadge tone="violet">Config v{record.configVersion}</AdminBadge>
        )}
        {dirty && <AdminBadge tone="amber">Unsaved changes</AdminBadge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Main column ── */}
        <div className="space-y-6 lg:col-span-2">
          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">Pitch details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <AdminLabel>Client name *</AdminLabel>
                <AdminInput
                  value={form.clientName}
                  onChange={(e) => patch({ clientName: e.target.value })}
                  maxLength={120}
                />
              </div>
              <div>
                <AdminLabel>Pitch title</AdminLabel>
                <AdminInput
                  value={form.pitchTitle}
                  onChange={(e) => patch({ pitchTitle: e.target.value })}
                  maxLength={140}
                />
              </div>
              <div>
                <AdminLabel>Industry</AdminLabel>
                <AdminSelect
                  value={form.industry}
                  onChange={(e) => patch({ industry: e.target.value })}
                >
                  {INDUSTRY_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </AdminSelect>
              </div>
              <div>
                <AdminLabel>Status</AdminLabel>
                <AdminSelect
                  value={form.status}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{PITCH_STATUS_LABEL[s]}</option>
                  ))}
                </AdminSelect>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <AdminLabel>Presented on</AdminLabel>
                <AdminInput
                  type="date"
                  value={form.presentedAt}
                  onChange={(e) => patch({ presentedAt: e.target.value })}
                />
              </div>
              <div>
                <AdminLabel>Follow-up due</AdminLabel>
                <AdminInput
                  type="date"
                  value={form.followUpAt}
                  onChange={(e) => patch({ followUpAt: e.target.value })}
                />
              </div>
            </div>
          </AdminCard>

          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">Customization summary</h3>
            <p className="text-xs text-slate-500">
              What was configured for this pitch — describe the setup, not file rewrites.
            </p>
            <AdminTextarea
              value={form.customizationSummary}
              onChange={(e) => patch({ customizationSummary: e.target.value })}
              maxLength={2000}
              rows={5}
              placeholder="e.g. Applied the Women's Fashion preset, uploaded the client logo, curated 8 featured products and rewrote the hero copy."
            />
            <p className="text-right text-[11px] text-slate-400">
              {form.customizationSummary.length}/2000
            </p>
          </AdminCard>

          {/* Configured interfaces */}
          <AdminCard className="space-y-3 p-5">
            <h3 className="text-sm font-bold text-slate-900">
              Configured interfaces ({form.configuredInterfaces.length})
            </h3>
            <p className="text-xs text-slate-500">
              Which storefront interfaces were customized for this pitch.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {INTERFACES.map((key) => {
                const checked = form.configuredInterfaces.includes(key);
                return (
                  <label
                    key={key}
                    className={
                      "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition " +
                      (checked
                        ? "border-[#0856DF] bg-[#0856DF]/5 text-[#0856DF]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIn("configuredInterfaces", key)}
                      className="h-4 w-4 rounded border-slate-300 accent-[#0856DF]"
                    />
                    {INTERFACE_LABELS[key]}
                  </label>
                );
              })}
            </div>
          </AdminCard>

          {/* Demonstrated features */}
          <AdminCard className="space-y-3 p-5">
            <h3 className="text-sm font-bold text-slate-900">
              Demonstrated features ({form.demonstratedFeatures.length})
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((key) => {
                const checked = form.demonstratedFeatures.includes(key);
                return (
                  <label
                    key={key}
                    className={
                      "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition " +
                      (checked
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIn("demonstratedFeatures", key)}
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                    />
                    {FEATURE_LABELS[key]}
                  </label>
                );
              })}
            </div>
          </AdminCard>

          {/* Notes */}
          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">
              Notes{" "}
              <AdminBadge tone="slate" className="ml-1">
                admin-only
              </AdminBadge>
            </h3>
            <div>
              <AdminLabel>Internal notes</AdminLabel>
              <AdminTextarea
                value={form.internalNotes}
                onChange={(e) => patch({ internalNotes: e.target.value })}
                maxLength={4000}
                rows={5}
                placeholder="Private context — never exposed on any public API."
              />
              <p className="mt-1 text-right text-[11px] text-slate-400">
                {form.internalNotes.length}/4000
              </p>
            </div>
            <div>
              <AdminLabel>Outcome notes</AdminLabel>
              <AdminTextarea
                value={form.outcomeNotes}
                onChange={(e) => patch({ outcomeNotes: e.target.value })}
                maxLength={2000}
                rows={4}
                placeholder="What was the outcome of the pitch?"
              />
            </div>
          </AdminCard>
        </div>

        {/* ── Side column ── */}
        <div className="space-y-6">
          <AdminCard className="space-y-4 p-5">
            <h3 className="text-sm font-bold text-slate-900">Showcase link</h3>
            <div>
              <AdminLabel>Linked showcase profile</AdminLabel>
              <AdminInput
                value={profileQuery}
                onChange={(e) => setProfileQuery(e.target.value)}
                placeholder="Search profiles (name, slug, client)…"
                maxLength={60}
                aria-label="Search showcase profiles"
                className="mb-2"
              />
              <AdminSelect
                value={form.showcaseProfileId}
                onChange={(e) => patch({ showcaseProfileId: e.target.value })}
              >
                <option value="">— No showcase linked —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.status})
                  </option>
                ))}
              </AdminSelect>
              {profiles.length === 0 && !profilesLoading && (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {profileQuery
                    ? "No profiles match your search."
                    : "No showcase profiles yet."}
                </p>
              )}
              {profilePages > profilePage && (
                <AdminButton
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled={profilesLoading}
                  onClick={() => void fetchProfiles(profileQuery.trim(), profilePage + 1)}
                >
                  {profilesLoading && <Loader2 size={13} className="animate-spin" />}
                  {profilesLoading ? "Loading…" : "Load more profiles"}
                </AdminButton>
              )}
              <p className="mt-1.5 text-[11px] text-slate-400">
                Linking snapshots the profile name/slug so this record stays readable even if
                the profile is later archived or renamed.
              </p>
            </div>

            {linkedProfile && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{linkedProfile.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                  /store/{linkedProfile.slug}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link href={`/Admin/ShowcaseStudio/${linkedProfile.id}`}>
                    <AdminButton variant="secondary" size="sm">
                      <Layers size={13} /> Open in Studio
                    </AdminButton>
                  </Link>
                  {linkedProfile.status === "published" && (
                    <a
                      href={`/store/${linkedProfile.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <AdminButton variant="secondary" size="sm">
                        <ExternalLink size={13} /> Live
                      </AdminButton>
                    </a>
                  )}
                </div>
              </div>
            )}

            <div>
              <AdminLabel>Preset used (snapshot)</AdminLabel>
              <AdminInput
                value={form.selectedPreset}
                onChange={(e) => patch({ selectedPreset: e.target.value })}
                maxLength={40}
                placeholder={INDUSTRY_PRESETS.find((p) => p.id === form.industry)?.name || ""}
              />
            </div>

            {/* Snapshot fields (read-only history) */}
            {record.profileNameSnapshot && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Recorded snapshot
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {record.profileNameSnapshot}
                </p>
                {record.profileSlug && (
                  <p className="font-mono text-[11px] text-slate-500">/store/{record.profileSlug}</p>
                )}
              </div>
            )}
          </AdminCard>

          <AdminCard className="space-y-3 p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <CalendarClock size={15} className="text-slate-400" />
              Timeline
            </h3>
            <div className="space-y-2 text-xs text-slate-600">
              <p>
                <span className="font-semibold text-slate-800">Created:</span>{" "}
                {new Date(record.createdAt).toLocaleString()}
              </p>
              <p>
                <span className="font-semibold text-slate-800">Last updated:</span>{" "}
                {new Date(record.updatedAt).toLocaleString()}
              </p>
              {record.presentedAt && (
                <p>
                  <span className="font-semibold text-slate-800">Presented:</span>{" "}
                  {new Date(record.presentedAt).toLocaleDateString()}
                </p>
              )}
              {record.followUpAt && (
                <p>
                  <span className="font-semibold text-slate-800">Follow-up:</span>{" "}
                  {new Date(record.followUpAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                <Sparkles size={13} /> Pitch outcome
              </p>
              <p className="mt-1 text-sm font-black text-violet-900">
                {PITCH_STATUS_LABEL[record.status] || record.status}
              </p>
            </div>
          </AdminCard>
        </div>
      </div>

      {/* Delete modal */}
      <AdminModal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete pitch record">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Delete the record for <strong>{record.clientName}</strong>? This cannot be undone.
            The linked showcase profile is not affected.
          </p>
          <div className="flex justify-end gap-2">
            <AdminButton variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </AdminButton>
            <AdminButton variant="danger" disabled={deleting} onClick={remove}>
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete permanently
            </AdminButton>
          </div>
        </div>
      </AdminModal>
    </div>
  );
};

export default PitchRecordDetailPage;
