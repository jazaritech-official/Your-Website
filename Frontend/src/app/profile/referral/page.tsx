"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Gift,
  MessageCircle,
  TrendingUp,
  Wallet,
  History,
  Users,
} from "lucide-react";
import { RootState, AppDispatch } from "@/app/Redux/store";
import { startLoading, stopLoading } from "@/app/Redux/Features/uiSlice";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import ProfileNav from "@/app/Components/ProfileNav";
import {
  Button,
  EmptyState,
  ErrorState,
  SectionLabel,
  buttonStyles,
} from "@/app/Components/ui";
import {
  buildWhatsAppShareUrl,
  copyText,
  DEFAULT_REWARD_PERCENTAGE,
  formatDate,
  formatRs,
  type ReferralOverview,
  type WalletTxn,
  walletSourceLabel,
} from "@/app/utils/referral";

const ReferralCenterPage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState(false);
  /* A failed fetch previously left `overview` null, which rendered the
     "unlock by spending more" view — a failure disguised as a progress state. */
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!auth.username) return;
    setLoading(true);
    try {
      const res = await axios.get(`${baseUrl}referral/overview`, {
        withCredentials: true,
      });
      setOverview(res.data?.data || null);
      setLoadError(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Failed to load referral center";
      setLoadError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [auth.username]);

  useEffect(() => {
    if (!auth.username) return;
    dispatch(startLoading("Referral Center"));
    fetchOverview().finally(() => dispatch(stopLoading()));
  }, [auth.username, fetchOverview, dispatch]);

  // Route guard: same inline fallback used by the profile / wishlist pages.
  // Placed right after the hooks so logged-out users skip the dead
  // history/stats computation below.
  if (!auth.username) {
    return (
      <main className="min-h-screen bg-surface-page px-4 pb-16 pt-8">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={<Gift size={26} />}
            title="Sign in to view your referral rewards"
            description="Your referral code, wallet balance and reward history are tied to your account."
            action={
              <Link href="/" className={buttonStyles({ variant: "gold", size: "md" })}>
                <ArrowLeft size={16} /> Back to Home
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  const handleCopy = async () => {
    if (!overview?.referral?.code) return;
    const ok = await copyText(overview.referral.code);
    if (ok) {
      setCopied(true);
      showToast("Referral code copied!", "success", "light");
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      showToast("Could not copy code", "error");
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const res = await axios.post(
        `${baseUrl}referral/claim`,
        {},
        { withCredentials: true }
      );
      await fetchOverview();
      if (res.data?.data?.unlocked) {
        showToast("Your referral code is ready!", "success");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Could not check eligibility", "error");
    } finally {
      setClaiming(false);
    }
  };

  const wallet = overview?.wallet;
  const referral = overview?.referral;
  const unlocked = Boolean(referral?.code);
  const settings = overview?.settings;

  const stats = [
    {
      label: "Wallet Balance",
      value: formatRs(wallet?.balance || 0),
      icon: Wallet,
      accent: "text-brand-gold-hover",
    },
    {
      label: "Lifetime Earned",
      value: formatRs(wallet?.lifetimeEarned || 0),
      icon: TrendingUp,
      accent: "text-state-success",
    },
    {
      label: "Pending Rewards",
      value: String(wallet?.pendingRewards || 0),
      icon: History,
      accent: "text-state-warning",
    },
    {
      label: "Successful Referrals",
      value: String(wallet?.successfulReferrals || 0),
      icon: Users,
      accent: "text-state-info",
    },
  ];

  const history: Array<{
    id: string;
    kind: "txn" | "reward";
    title: string;
    sub: string;
    amount: string;
    positive: boolean;
    date: string;
  }> = [];

  (overview?.recentTransactions || []).forEach((t: WalletTxn) => {
    history.push({
      id: `t-${t._id}`,
      kind: "txn",
      title: walletSourceLabel[t.source] || t.source,
      sub: t.note || "",
      amount: `${t.type === "credit" ? "+" : "-"} ${formatRs(t.amount)}`,
      positive: t.type === "credit",
      date: formatDate(t.createdAt),
    });
  });
  (overview?.recentRewards || []).forEach((r: any) => {
    history.push({
      id: `r-${r._id}`,
      kind: "reward",
      title: `Reward — code ${r.code}`,
      sub: `Order total ${formatRs(r.orderTotal)} · ${r.status}`,
      amount: `+ ${formatRs(r.amount)}`,
      positive: r.status === "credited" || r.status === "approved",
      date: formatDate(r.createdAt),
    });
  });
  history.sort((a, b) => (a.date > b.date ? -1 : 1));

  return (
    <div className="min-h-screen bg-surface-page px-4 pb-16 pt-8">
      {/* Group entrance — the stats grid and history rows animate as one
          surface rather than per-row, keeping the effect cheap. */}
      <div className="mx-auto max-w-3xl ir-fade-in-up">
        <Link
          href="/profile"
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-brand-gold-hover"
        >
          <ArrowLeft size={16} /> Back to Profile
        </Link>
        <header className="mb-5">
          <SectionLabel>Your account</SectionLabel>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-brand-navy sm:text-4xl">
            Referral Center
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Earn rewards every time a friend shops with your code
          </p>
        </header>

        {/* The Referral tab follows the SAME `programEnabled` flag checkout and
            the referral landing gate consume — nothing is hardcoded visible. */}
        <ProfileNav referralEnabled={overview?.programEnabled !== false} />

        {loading && !overview ? (
          <div className="space-y-5">
            <div className="h-56 animate-pulse rounded-card border border-line bg-surface shadow-card" />
            <div className="h-28 animate-pulse rounded-card border border-line bg-surface shadow-card" />
            <div className="h-40 animate-pulse rounded-card border border-line bg-surface shadow-card" />
          </div>
        ) : loadError && !overview ? (
          <ErrorState
            title="We couldn't load your referral center"
            message={loadError}
            onRetry={fetchOverview}
          />
        ) : overview?.programEnabled === false ? (
          /* Program switched off in admin settings — show no program UI at all. */
          <EmptyState
            icon={<Gift size={26} />}
            title="Referral rewards are unavailable right now"
            description="The referral program is currently switched off. Anything already in your wallet is unaffected."
            action={
              <Link href="/productsPage" className={buttonStyles({ variant: "gold", size: "md" })}>
                Continue shopping
              </Link>
            }
          />
        ) : (
          <div className="space-y-6">
            {/* ── Code / progress hero ── */}
            <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <div
                className="relative px-6 py-9 text-center sm:px-7"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-brand-navy) 0%, #2b3340 55%, var(--color-brand-gold) 130%)",
                }}
              >
                {unlocked ? (
                  <>
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-card bg-white/10 ring-1 ring-white/25">
                      <Gift className="h-7 w-7 text-brand-gold" aria-hidden />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold">
                      Your Exclusive Referral Code
                    </p>
                    <div className="mx-auto mt-3 inline-flex items-center gap-3 rounded-card border-2 border-dashed border-brand-gold/70 bg-brand-navy/40 px-6 py-3">
                      <code className="font-mono text-2xl font-black tracking-[0.2em] text-white sm:text-3xl">
                        {referral?.code}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopy}
                        aria-label={copied ? "Referral code copied" : "Copy referral code"}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-brand-gold text-brand-navy-deep transition-colors hover:bg-brand-gold-hover active:scale-95"
                      >
                        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      {/* #25D366 is WhatsApp's own brand colour — intentionally
                          not part of the IRHAS'INN palette. */}
                      <a
                        href={buildWhatsAppShareUrl(referral!.code)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-field bg-[#25D366] px-4 text-xs font-bold text-white shadow-lg shadow-black/20 transition hover:brightness-105 active:scale-95"
                      >
                        <MessageCircle size={14} aria-hidden /> Share on WhatsApp
                      </a>
                    </div>
                    <p className="mt-4 text-xs font-medium text-white/70">
                      You earn {settings?.rewardPercentage || DEFAULT_REWARD_PERCENTAGE}% of every referred order
                      {settings?.maxReward ? ` (up to ${formatRs(settings.maxReward)})` : ""} — credited
                      when their order is delivered.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-card bg-white/10 ring-1 ring-white/25">
                      <Gift className="h-7 w-7 text-brand-gold" aria-hidden />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold">
                      Unlock your Exclusive Referral Rewards
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      Spend {formatRs(settings?.minLifetimePurchase || 9999)} Lifetime
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm font-medium text-white/75">
                      Complete deliveries count towards your lifetime spend. Once you cross the
                      threshold, your permanent referral code unlocks automatically.
                    </p>
                    <div className="mx-auto mt-5 max-w-sm">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/60">
                        <span>{formatRs(overview?.lifetimeSpend || 0)} spent</span>
                        <span>{overview?.progress || 0}%</span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/15">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-gold to-brand-gold/50 transition-all duration-700"
                          style={{ width: `${Math.min(100, overview?.progress || 0)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-brand-gold">
                        {formatRs(overview?.remainingToUnlock || 0)} more to unlock
                      </p>
                    </div>
                    <Button
                      variant="gold"
                      size="md"
                      className="mt-5"
                      loading={claiming}
                      onClick={handleClaim}
                    >
                      {claiming ? "Checking…" : "Check My Eligibility"}
                    </Button>
                  </>
                )}
              </div>
              <div className="h-1.5 bg-gradient-to-r from-brand-gold via-brand-navy to-brand-gold" />
              <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
                {stats.map((s) => (
                  <div key={s.label} className="bg-surface p-4 text-center">
                    <s.icon size={18} aria-hidden className={`mx-auto mb-1.5 ${s.accent}`} />
                    <p className="text-lg font-black text-brand-navy">{s.value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── How it works ── */}
            <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-7">
              <h3 className="text-lg font-bold text-brand-navy">How it works</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    step: "1",
                    title: "Share your code",
                    body: "Send your referral code to friends on WhatsApp or any platform.",
                  },
                  {
                    step: "2",
                    title: "They order",
                    body: "A friend enters your code at checkout — rewards are never a discount.",
                  },
                  {
                    step: "3",
                    title: "You earn on delivery",
                    body: `Rewards turn into wallet credit only after their order is delivered.`,
                  },
                ].map((c) => (
                  <div
                    key={c.step}
                    className="rounded-card border border-line bg-surface-muted p-4 transition-colors hover:border-brand-gold/40"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-navy text-xs font-black text-brand-gold">
                      {c.step}
                    </span>
                    <p className="mt-3 text-sm font-bold text-brand-navy">{c.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{c.body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── History ── */}
            <div className="rounded-card border border-line bg-surface shadow-card">
              <div className="flex items-center justify-between border-b border-line px-6 py-4">
                <h3 className="text-lg font-bold text-brand-navy">Referral History</h3>
                <History size={18} aria-hidden className="text-ink-subtle" />
              </div>
              {history.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-ink-muted">
                  No activity yet. Share your code to start earning rewards.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {history.slice(0, 20).map((h) => (
                    <li key={h.id} className="flex items-center gap-4 px-6 py-3.5">
                      <span
                        aria-hidden
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-field ${
                          h.positive
                            ? "bg-state-success/12 text-state-success"
                            : "bg-surface-muted text-ink-muted"
                        }`}
                      >
                        <ArrowRight size={15} className={h.positive ? "rotate-180" : ""} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-brand-navy">{h.title}</p>
                        {h.sub && <p className="truncate text-xs text-ink-muted">{h.sub}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-sm font-black ${
                            h.positive ? "text-state-success" : "text-brand-navy"
                          }`}
                        >
                          {h.amount}
                        </p>
                        <p className="text-[10px] text-ink-subtle">{h.date}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReferralCenterPage;
