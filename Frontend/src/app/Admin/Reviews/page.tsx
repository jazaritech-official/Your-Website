"use client";

import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import {
  Star,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flag,
  Loader2,
  Trash2,
  Shield,
} from "lucide-react";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";

/* ============================================================
   ADMIN REVIEWS — Professional review moderation page
   
   Features:
   - Search reviews
   - Filter by status (All, Pending, Approved, Rejected)
   - Filter by rating (All, 5-1)
   - Approve/Reject/Delete reviews
   - Pagination
   - Responsive design
   ============================================================ */

interface AdminReview {
  _id: string;
  user: { _id: string; username: string; email: string; profilePic?: string };
  product: { _id: string; name: string; slug?: string };
  rating: number;
  title?: string;
  comment: string;
  status: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  reportCount: number;
  reports?: Array<{ user: string; reason: string; createdAt: string }>;
  createdAt: string;
}

type StatusFilter = "" | "pending" | "approved" | "rejected";

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "15",
      });
      if (statusFilter) params.set("status", statusFilter);
      if (ratingFilter) params.set("rating", String(ratingFilter));
      if (searchDebounced) params.set("search", searchDebounced);

      const res = await axios.get(`${baseUrl}reviews/admin/all?${params}`, {
        withCredentials: true,
      });
      const data = res.data?.data || {};
      setReviews(data.reviews || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to load reviews", "error");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, ratingFilter, searchDebounced]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const updateStatus = async (reviewId: string, newStatus: string) => {
    setUpdatingId(reviewId);
    try {
      await axios.patch(
        `${baseUrl}reviews/admin/${reviewId}/status`,
        { status: newStatus },
        { withCredentials: true }
      );
      showToast(`Review ${newStatus}`, "success");
      fetchReviews();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to update", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteReview = async (reviewId: string) => {
    if (!window.confirm("Delete this review permanently?")) return;
    setUpdatingId(reviewId);
    try {
      await axios.delete(`${baseUrl}reviews/admin/${reviewId}`, {
        withCredentials: true,
      });
      showToast("Review deleted", "success");
      fetchReviews();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to delete", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-amber-50 text-amber-700",
      approved: "bg-emerald-50 text-emerald-700",
      rejected: "bg-red-50 text-red-700",
    };
    const icons: Record<string, any> = {
      pending: Clock,
      approved: CheckCircle2,
      rejected: XCircle,
    };
    const Icon = icons[status] || Clock;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${styles[status] || "bg-slate-100 text-slate-600"}`}>
        <Icon size={11} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Review Moderation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage customer reviews across all products
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reviews..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-[#0856DF] focus:outline-none focus:bg-white"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          {(["", "pending", "approved", "rejected"] as StatusFilter[]).map((status) => (
            <button
              key={status || "all"}
              onClick={() => { setStatusFilter(status); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === status
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {status ? status.charAt(0).toUpperCase() + status.slice(1) : "All"}
            </button>
          ))}
        </div>

        {/* Rating filter */}
        <div className="flex items-center gap-1">
          <Star size={12} className="text-[#C8A84E]" />
          {[null, 5, 4, 3, 2, 1].map((r) => (
            <button
              key={r ?? "all"}
              onClick={() => { setRatingFilter(r); setPage(1); }}
              className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                ratingFilter === r
                  ? "bg-[#C8A84E] text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {r ? `${r}★` : "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="text-xs text-slate-500">
        Showing {reviews.length} of {total} reviews
      </div>

      {/* Reviews table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Reviewer</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Review</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Loader2 size={20} className="mx-auto animate-spin text-slate-400" />
                  </td>
                </tr>
              ) : reviews.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    No reviews found
                  </td>
                </tr>
              ) : (
                reviews.map((review) => (
                  <tr key={review._id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    {/* Reviewer */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                          {review.user?.username?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">
                            {review.user?.username || "—"}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {review.user?.email || ""}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Product */}
                    <td className="px-4 py-3">
                      <p className="max-w-[120px] truncate text-xs font-medium text-slate-700">
                        {review.product?.name || "—"}
                      </p>
                    </td>

                    {/* Rating */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={12}
                            className={s <= review.rating ? "fill-[#C8A84E] text-[#C8A84E]" : "text-slate-300"}
                          />
                        ))}
                      </div>
                    </td>

                    {/* Review */}
                    <td className="px-4 py-3 max-w-[200px]">
                      {review.title && (
                        <p className="text-xs font-bold text-slate-900 truncate">{review.title}</p>
                      )}
                      <p className="text-[11px] text-slate-500 line-clamp-2">{review.comment}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {review.verifiedPurchase && (
                          <span className="text-[9px] font-bold text-emerald-600">✓ Verified</span>
                        )}
                        {review.reportCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-500">
                            <Flag size={9} />
                            {review.reportCount}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {statusBadge(review.status)}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-slate-400">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {review.status !== "approved" && (
                          <button
                            onClick={() => updateStatus(review._id, "approved")}
                            disabled={updatingId === review._id}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            <CheckCircle2 size={11} />
                            Approve
                          </button>
                        )}
                        {review.status !== "rejected" && (
                          <button
                            onClick={() => updateStatus(review._id, "rejected")}
                            disabled={updatingId === review._id}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 transition hover:bg-red-100"
                          >
                            <XCircle size={11} />
                            Reject
                          </button>
                        )}
                        <button
                          onClick={() => deleteReview(review._id)}
                          disabled={updatingId === review._id}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-200"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
