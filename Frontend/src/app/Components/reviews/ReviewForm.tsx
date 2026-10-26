"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Edit3, Trash2 } from "lucide-react";
import { StarSelector } from "./StarRating";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import axios from "axios";

/* ============================================================
   REVIEW FORM — Premium review submission form
   
   Features:
   - Star selection with hover preview
   - Title (optional) + comment
   - Edit existing review
   - Delete existing review
   - Success state with animation
   ============================================================ */

export interface ExistingReview {
  _id: string;
  rating: number;
  title?: string;
  comment: string;
  verifiedPurchase: boolean;
}

export default function ReviewForm({
  productId,
  existingReview,
  verifiedPurchase,
  onSuccess,
}: {
  productId: string;
  existingReview?: ExistingReview | null;
  verifiedPurchase: boolean;
  onSuccess: () => void;
}) {
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [title, setTitle] = useState(existingReview?.title || "");
  const [comment, setComment] = useState(existingReview?.comment || "");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isEditing, setIsEditing] = useState(!existingReview);
  const [deleting, setDeleting] = useState(false);

  const isUpdate = !!existingReview;
  const hasContent = rating > 0 || comment.trim().length > 0;

  const handleSubmit = async () => {
    if (!rating) {
      showToast("Please select a star rating", "error");
      return;
    }
    if (!comment.trim() || comment.trim().length < 5) {
      showToast("Please write at least 5 characters", "error");
      return;
    }

    setSubmitting(true);
    try {
      if (isUpdate && existingReview) {
        await axios.patch(
          `${baseUrl}reviews/${existingReview._id}`,
          { rating, title: title.trim(), comment: comment.trim() },
          { withCredentials: true }
        );
        showToast("Review updated successfully", "success");
      } else {
        await axios.post(
          `${baseUrl}reviews/product/${productId}`,
          { rating, title: title.trim(), comment: comment.trim() },
          { withCredentials: true }
        );
        showToast("Review submitted successfully!", "success");
      }
      setSubmitted(true);
      setIsEditing(false);
      onSuccess();
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to submit review",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingReview) return;
    if (!window.confirm("Delete your review? This cannot be undone.")) return;

    setDeleting(true);
    try {
      await axios.delete(`${baseUrl}reviews/${existingReview._id}`, {
        withCredentials: true,
      });
      showToast("Review deleted", "success");
      setRating(0);
      setTitle("");
      setComment("");
      setSubmitted(false);
      setIsEditing(true);
      onSuccess();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to delete", "error");
    } finally {
      setDeleting(false);
    }
  };

  // Success state
  if (submitted && !isEditing) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
        >
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
        </motion.div>
        <p className="mt-3 text-sm font-bold text-emerald-800">
          {isUpdate ? "Review updated!" : "Review submitted!"}
        </p>
        <p className="mt-1 text-xs text-emerald-600">
          Thank you for sharing your experience.
        </p>
        {isUpdate && (
          <button
            onClick={() => {
              setIsEditing(true);
              setSubmitted(false);
            }}
            className="mt-3 text-xs font-bold text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
          >
            Edit again
          </button>
        )}
      </motion.div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">
          {isUpdate ? "Edit Your Review" : "Write a Review"}
        </p>
        {isUpdate && (
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-50"
            >
              {deleting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Verified purchase indicator */}
      {verifiedPurchase && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
          <CheckCircle2 size={10} />
          Verified Purchase
        </div>
      )}

      {/* Star rating */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-slate-600">Rating *</p>
        <StarSelector value={rating} onChange={setRating} size={32} />
        {rating > 0 && (
          <p className="mt-1 text-[11px] text-slate-400">
            {rating === 1 && "Poor"}
            {rating === 2 && "Fair"}
            {rating === 3 && "Good"}
            {rating === 4 && "Very Good"}
            {rating === 5 && "Excellent"}
          </p>
        )}
      </div>

      {/* Title */}
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
          Title (optional)
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Summarize your experience"
          maxLength={100}
          className="w-full rounded-xl border border-slate-200 bg-surface px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold/30"
        />
      </div>

      {/* Comment */}
      <div className="mt-3">
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
          Your Review *
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What did you like or dislike? How was the quality?"
          rows={4}
          maxLength={1000}
          className="w-full resize-none rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold/30"
        />
        <p className="mt-1 text-right text-[10px] text-slate-400">
          {comment.length}/1000
        </p>
      </div>

      {/* Submit */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleSubmit}
        disabled={submitting || !rating || comment.trim().length < 5}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-gold px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Submitting…
          </>
        ) : isUpdate ? (
          <>
            <Edit3 size={14} />
            Update Review
          </>
        ) : (
          "Submit Review"
        )}
      </motion.button>
    </div>
  );
}
