"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import {
  Bike,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  UserRound,
} from "lucide-react";

interface RiderApplication {
  _id: string;
  username: string;
  email: string;
  phoneNo?: string;
  profilePic?: string;
  role: string;
  riderApplicationStatus: "pending" | "approved" | "rejected";
  riderApplication?: {
    fullName: string;
    phoneNo: string;
    vehicleType: string;
    cnic: string;
    licensePlate: string;
    idDocumentUrl: string;
    licenseDocumentUrl: string;
  };
  riderApplicationAt?: string;
  riderApprovedAt?: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
};

const AdminRiderApplicationsPage = () => {
  const [applications, setApplications] = useState<RiderApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await axios.get(`${baseUrl}rider/applications${params}`, {
        withCredentials: true,
      });
      setApplications(res.data?.data || []);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to load applications", "error");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const approve = async (userId: string) => {
    setProcessingId(userId);
    try {
      await axios.patch(`${baseUrl}rider/applications/${userId}/approve`, {}, {
        withCredentials: true,
      });
      showToast("Application approved — user is now a rider", "success");
      fetchApplications();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to approve", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const reject = async (userId: string) => {
    setProcessingId(userId);
    try {
      await axios.patch(`${baseUrl}rider/applications/${userId}/reject`, {}, {
        withCredentials: true,
      });
      showToast("Application rejected", "success");
      fetchApplications();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to reject", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const tabs = [
    { key: "all" as const, label: "All", count: applications.length },
    { key: "pending" as const, label: "Pending", count: applications.filter((a) => a.riderApplicationStatus === "pending").length },
    { key: "approved" as const, label: "Approved", count: applications.filter((a) => a.riderApplicationStatus === "approved").length },
    { key: "rejected" as const, label: "Rejected", count: applications.filter((a) => a.riderApplicationStatus === "rejected").length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Rider Applications
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Review and manage rider onboarding applications
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
              filter === t.key
                ? "bg-[#0856DF] text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Applications list */}
      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-24">
          <Loader2 size={28} className="animate-spin text-[#C8A84E]" />
        </div>
      ) : applications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-20 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Bike size={24} className="text-slate-400" />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-600">
            No {filter !== "all" ? filter : ""} applications found
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <div
              key={app._id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0856DF]/10 text-[#0856DF]">
                      {app.profilePic ? (
                        <img src={app.profilePic} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <UserRound size={18} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {app.riderApplication?.fullName || app.username}
                      </p>
                      <p className="text-xs text-slate-500">{app.email}</p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                      statusColors[app.riderApplicationStatus] || ""
                    }`}
                  >
                    {(() => {
                      const s = app.riderApplicationStatus || "none";
                      return s.charAt(0).toUpperCase() + s.slice(1);
                    })()}
                  </span>
                </div>

                {/* Application details */}
                {app.riderApplication && (
                  <div className="mt-4 grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Info label="Phone" value={app.riderApplication.phoneNo || "—"} />
                    <Info label="Vehicle" value={app.riderApplication.vehicleType || "—"} />
                    <Info label="CNIC" value={app.riderApplication.cnic || "—"} />
                    <Info label="License Plate" value={app.riderApplication.licensePlate || "—"} />
                    {app.riderApplication.idDocumentUrl && (
                      <a
                        href={app.riderApplication.idDocumentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#0856DF] hover:underline"
                      >
                        <ExternalLink size={12} /> View ID Document
                      </a>
                    )}
                    {app.riderApplication.licenseDocumentUrl && (
                      <a
                        href={app.riderApplication.licenseDocumentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#0856DF] hover:underline"
                      >
                        <ExternalLink size={12} /> View License
                      </a>
                    )}
                  </div>
                )}

                <p className="mt-2 text-[11px] text-slate-400">
                  Submitted: {app.riderApplicationAt ? new Date(app.riderApplicationAt).toLocaleString() : "—"}
                  {app.riderApprovedAt && ` · Approved: ${new Date(app.riderApprovedAt).toLocaleString()}`}
                </p>

                {/* Actions — only for pending */}
                {app.riderApplicationStatus === "pending" && (
                  <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                    <button
                      onClick={() => approve(app._id)}
                      disabled={processingId === app._id}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {processingId === app._id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={13} />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => reject(app._id)}
                      disabled={processingId === app._id}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      {processingId === app._id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <XCircle size={13} />
                      )}
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}

export default AdminRiderApplicationsPage;
