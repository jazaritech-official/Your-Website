"use client";
import { formatPKR } from "@/app/utils/format";

import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Package,
  Loader2,
  Clock,
  ChevronRight,
} from "lucide-react";
import {
  jobCardVariants,
  newJobVariants,
  acceptButtonVariants,
  staggerContainer,
} from "./RiderAnimations";
import { cloudinaryUrl } from "@/app/utils/commonFunctions";
import { useBranding } from "../ThemeProvider";

/* ============================================================
   AVAILABLE JOB CARD — Premium marketplace job card
   
   Features:
   - New-job entrance animation (slides in from top with glow)
   - Product thumbnail with quantity badge
   - City + item count chips
   - Payout amount prominently displayed
   - Accept button with loading state
   - Smooth removal on accept
   ============================================================ */

export interface MarketplaceJob {
  _id: string;
  serialNumber?: number;
  trackingNumber?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  shippingPrice: number;
  deliveryCity: string;
  itemCount: number;
  firstItemName: string;
  firstItemImage?: string | { url?: string; public_id?: string; alt?: string } | null;
  totalQuantity: number;
}

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function JobCard({
  job,
  isAccepting,
  isNew,
  onAccept,
}: {
  job: MarketplaceJob;
  isAccepting: boolean;
  isNew?: boolean;
  onAccept: (id: string) => void;
}) {
  /* Pickup identity — the store the rider collects from. The /rider route is
     excluded from showcase overrides, so this is always the real operating
     business's configured branding (admin-controlled, never a demo brand). */
  const { siteName } = useBranding();
  return (
    <motion.div
      layout
      variants={isNew ? newJobVariants : jobCardVariants}
      initial="hidden"
      animate="visible"
      exit={{
        opacity: 0,
        x: -60,
        scale: 0.95,
        transition: { duration: 0.25 },
      }}
      whileHover="hover"
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* New job glow overlay */}
      {isNew && (
        <motion.div
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2 }}
          className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#0856DF]/10 via-[#0856DF]/5 to-transparent pointer-events-none"
        />
      )}

      <div className="relative p-4">
        <div className="flex items-start gap-3.5">
          {/* Product thumbnail */}
          <div className="relative flex-shrink-0">
            {(() => {
              const imgUrl = typeof job.firstItemImage === "string"
                ? job.firstItemImage
                : job.firstItemImage && typeof job.firstItemImage === "object"
                  ? job.firstItemImage.url
                  : null;
              return imgUrl ? (
                <img
                  src={cloudinaryUrl(imgUrl, 96)}
                  alt=""
                  className="h-14 w-14 rounded-xl object-cover"
                  loading="lazy"
                />
              ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100">
                <Package size={22} className="text-slate-400" />
              </div>
              );
            })()}
            {/* Quantity badge */}
            {job.itemCount > 1 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#0856DF] px-1.5 text-[10px] font-bold text-white shadow-sm">
                {job.itemCount}
              </span>
            )}
          </div>

          {/* Job details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {job.firstItemName || "Delivery Order"}
                  {job.itemCount > 1 && (
                    <span className="ml-1 text-slate-400 font-medium">
                      +{job.itemCount - 1} more
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                  #{job.serialNumber || job._id.slice(-6).toUpperCase()}
                </p>
              </div>

              {/* Delivery fee — the order's shipping amount (what the customer
                  pays for delivery), not a confirmed rider payout. Orders with
                  free shipping show "Free" rather than a misleading Rs 0.00. */}
              <div className="flex-shrink-0 text-right">
                <p className="text-lg font-black text-[#0856DF] tabular-nums">
                  {job.shippingPrice > 0 ? formatPKR(job.shippingPrice) : "Free"}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Delivery Fee
                </p>
              </div>
            </div>

            {/* Tags */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                Pickup From
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800">
                {siteName}
              </span>
              {job.deliveryCity && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                  <MapPin size={10} />
                  {job.deliveryCity}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                <Package size={10} />
                {job.totalQuantity} item{job.totalQuantity !== 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-400">
                <Clock size={9} />
                {timeSince(job.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Accept button */}
        <motion.button
          variants={acceptButtonVariants}
          initial="idle"
          whileHover={isAccepting ? "idle" : "hover"}
          whileTap={isAccepting ? "idle" : "tap"}
          onClick={() => onAccept(job._id)}
          disabled={isAccepting}
          className={`mt-4 w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
            isAccepting
              ? "bg-[#0856DF]/70 text-white cursor-wait"
              : "bg-[#0856DF] text-white hover:bg-[#0645c8] active:bg-[#053ab5]"
          }`}
        >
          {isAccepting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Accepting…</span>
            </>
          ) : (
            <>
              <span>Accept Delivery</span>
              <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ── Job List with stagger animation ── */
export function JobList({
  jobs,
  acceptingId,
  onAccept,
  newJobIds,
}: {
  jobs: MarketplaceJob[];
  acceptingId: string | null;
  onAccept: (id: string) => void;
  newJobIds: Set<string>;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-3"
    >
      <AnimatePresence mode="popLayout">
        {jobs.map((job) => (
          <JobCard
            key={job._id}
            job={job}
            isAccepting={acceptingId === job._id}
            isNew={newJobIds.has(job._id)}
            onAccept={onAccept}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
