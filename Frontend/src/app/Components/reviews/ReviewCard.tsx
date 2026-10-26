"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ThumbsUp,
  Flag,
  CheckCircle2,
  MoreHorizontal,
} from "lucide-react";
import { StarDisplay } from "./StarRating";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import axios from "axios";

/* ============================================================
   REVIEW CARD — Premium review display
   
   Shows: avatar, name, stars, verified badge, date, title,
   comment, helpful button, report button.
   ============================================================ */

export interface ReviewData {
  _id: string;
  user: { _id: string; username: string; profilePic?: string };
  rating: number;
  title?: string;
  comment: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  helpfulBy?: string[];
  reportCount: number;
  createdAt: string;
  status?: string;
}

export default function ReviewCard({
  review,
  currentUserId,
  onHelpfulToggle,
  onReport,
}: {
  review: ReviewData;
  currentUserId?: string | null;
  onHelpfulToggle?: (reviewId: string, voted: boolean, count: number) => void;
  onReport?: (reviewId: string) => void;
}) {
  const [helpfulCount, setHelpfulCount] = useState(review.helpfulCount || 0);
  const [hasVoted, setHasVoted] = useState(
    review.helpfulBy?.includes(currentUserId || "") || false
  );
  const [voting, setVoting] = useState(false);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [reported, setReported] = useState(false);

  const isOwnReview = currentUserId === review.user?._id;
  const userInitial = review.user?.username?.charAt(0).toUpperCase() || "U";
  const timeAgo = getTimeAgo(review.createdAt);

  const handleHelpful = async () => {
    if (!currentUserId || voting) return;
    setVoting(true);
    try {
      const res = await axios.post(
        `${baseUrl}reviews/${review._id}/helpful`,
        {},
        { withCredentials: true }
      );
      const data = res.data?.data;
      setHasVoted(data.voted);
      setHelpfulCount(data.helpfulCount);
      onHelpfulToggle?.(review._id, data.voted, data.helpfulCount);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to vote", "error");
    } finally {
      setVoting(false);
    }
  };

  const handleReport = async (reason: string) => {
    if (!currentUserId) return;
    try {
      await axios.post(
        `${baseUrl}reviews/${review._id}/report`,
        { reason },
        { withCredentials: true }
      );
      setReported(true);
      setShowReportMenu(false);
      showToast("Review reported. Thank you.", "success");
      onReport?.(review._id);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to report", "error");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm sm:rounded-2xl sm:p-5"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-gold text-xs font-bold text-white sm:h-10 sm:w-10">
          {userInitial}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold capitalize text-slate-900">
              {review.user?.username || "Customer"}
            </p>
            {review.verifiedPurchase && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <CheckCircle2 size={10} />
                Verified Purchase
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2">
            <StarDisplay rating={review.rating} size={14} />
            <span className="text-[11px] text-slate-400">{timeAgo}</span>
          </div>
        </div>
      </div>

      {/* Title + Comment */}
      {review.title && (
        <p className="mt-3 text-sm font-bold text-slate-900">{review.title}</p>
      )}
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
        {review.comment}
      </p>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-3">
        {currentUserId && !isOwnReview && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleHelpful}
            disabled={voting}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              hasVoted
                ? "bg-brand-gold/10 text-brand-gold"
                : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            }`}
          >
            <ThumbsUp size={12} className={hasVoted ? "fill-[#C8A84E]" : ""} />
            Helpful {helpfulCount > 0 && `(${helpfulCount})`}
          </motion.button>
        )}

        {currentUserId && !isOwnReview && !reported && (
          <div className="relative">
            <button
              onClick={() => setShowReportMenu(!showReportMenu)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            >
              <Flag size={11} />
              Report
            </button>
            {showReportMenu && (
              <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-xl border border-slate-200 bg-surface p-1 shadow-lg">
                {["spam", "offensive", "fake", "irrelevant", "other"].map(
                  (reason) => (
                    <button
                      key={reason}
                      onClick={() => handleReport(reason)}
                      className="w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium capitalize text-slate-600 transition hover:bg-slate-50"
                    >
                      {reason}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {reported && (
          <span className="text-xs text-slate-400">Reported</span>
        )}
      </div>
    </motion.div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
