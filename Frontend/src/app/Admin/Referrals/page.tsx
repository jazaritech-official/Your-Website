"use client";
import { formatPKR } from "@/app/utils/format";

import { useEffect, useState } from "react";
import axios from "axios";
import useFetch, { baseUrl, showToast } from "@/app/utils/commonFunctions";
import { copyText } from "@/app/utils/referral";
import {
  Gift,
  Users,
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Save,
  Loader2,
  Trophy,
  Search,
  Copy,
  UserRound,
  ArrowLeft,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminLoading,
  AdminPageHeader,
  AdminTableWrap,
  AdminTd,
  AdminTh,
} from "../components/adminUI";

interface ReferralSettings {
  programEnabled: boolean;
  rewardPercentage: number;
  minLifetimePurchase: number;
  maxReward: number;
  walletUsagePercent: number;
  firstPurchaseOnly: boolean;
  rewardExpiryMonths: number;
}

interface StatsData {
  settings: ReferralSettings;
  totals: {
    referralUsers: number;
    walletBalance: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    pendingRewards: number;
    successfulReferrals: number;
  };
  pending: { count: number; amount: number };
  credited: { count: number; amount: number };
  cancelled: { count: number; amount: number };
  topReferrers: Array<{
    referrerId: string;
    username: string;
    email: string;
    rewards: number;
    total: number;
  }>;
  recentRewards: any[];
  recentTransactions: any[];
}

const ReferralsPage = () => {
  const { data: statsRes, loading, reFetch } = useFetch<any>(
    `${baseUrl}referral/admin/stats`,
  );
  const [stats, setStats] = useState<StatsData | null>(null);
  const [form, setForm] = useState<ReferralSettings | null>(null);
  const [saving, setSaving] = useState(false);

  // Referral user / code search + detail panel
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await axios.get(`${baseUrl}referral/admin/search`, {
        params: { q },
        withCredentials: true,
      });
      setSearchResults(res.data?.data || []);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Search failed", "error");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectUser = async (userId: string) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`${baseUrl}referral/admin/users/${userId}`, {
        withCredentials: true,
      });
      setSelectedUser(res.data?.data || null);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Could not load user details", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    const ok = await copyText(code);
    if (ok) showToast("Referral code copied", "success");
    else showToast("Could not copy code", "error");
  };

  useEffect(() => {
    if (statsRes?.data) setStats(statsRes.data as StatsData);
  }, [statsRes?.data]);

  useEffect(() => {
    if (stats?.settings && !form) {
      setForm({
        programEnabled: stats.settings.programEnabled,
        rewardPercentage: stats.settings.rewardPercentage,
        minLifetimePurchase: stats.settings.minLifetimePurchase,
        maxReward: stats.settings.maxReward,
        walletUsagePercent: stats.settings.walletUsagePercent,
        firstPurchaseOnly: stats.settings.firstPurchaseOnly,
        rewardExpiryMonths: stats.settings.rewardExpiryMonths,
      });
    }
  }, [stats, form]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await axios.put(`${baseUrl}referral/admin/settings`, form, {
        withCredentials: true,
      });
      showToast("Referral settings saved", "success");
      reFetch();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !stats) {
    return <AdminLoading message="Loading referral analytics…" />;
  }

  const s = stats?.totals;
  const statCards = [
    {
      label: "Total Referral Users",
      value: String(s?.referralUsers || 0),
      icon: Users,
      tone: "text-blue-600 bg-blue-50",
    },
    {
      label: "Wallet Balance (Total)",
      value: `${formatPKR((s?.walletBalance || 0))}`,
      icon: Wallet,
      tone: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Lifetime Rewards Earned",
      value: `${formatPKR((s?.lifetimeEarned || 0))}`,
      icon: TrendingUp,
      tone: "text-violet-600 bg-violet-50",
    },
    {
      label: "Pending Rewards",
      value: `${stats?.pending?.count || 0} · ${formatPKR((stats?.pending?.amount || 0))}`,
      icon: Clock,
      tone: "text-amber-600 bg-amber-50",
    },
    {
      label: "Approved / Credited",
      value: `${stats?.credited?.count || 0} · ${formatPKR((stats?.credited?.amount || 0))}`,
      icon: CheckCircle2,
      tone: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Cancelled Rewards",
      value: `${stats?.cancelled?.count || 0} · ${formatPKR((stats?.cancelled?.amount || 0))}`,
      icon: XCircle,
      tone: "text-red-600 bg-red-50",
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Referral Rewards"
        subtitle="Program analytics, settings and top performers"
        actions={
          stats?.settings?.programEnabled ? (
            <AdminBadge tone="emerald">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Program Active
            </AdminBadge>
          ) : (
            <AdminBadge tone="red">Program Paused</AdminBadge>
          )
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {statCards.map((card) => (
          <AdminCard key={card.label} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {card.label}
                </p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  {card.value}
                </h3>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.tone}`}>
                <card.icon size={20} />
              </div>
            </div>
          </AdminCard>
        ))}
      </div>

      {/* Referral user / code search + user detail */}
      <AdminCard>
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Search size={18} className="text-[#0856DF]" /> Find a Referral User
          </h3>
        </div>
        <div className="p-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <AdminInput
              type="text"
              placeholder="Search by referral code, username or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <AdminButton type="submit" disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search size={15} />}
              Search
            </AdminButton>
          </form>

          {/* Results */}
          {searchResults !== null && (
            <div className="mt-4">
              {searchResults.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  No users match that search.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {searchResults.map((r: any) => (
                    <li key={r.userId} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <UserRound size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {r.username || "Unnamed user"}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {r.email || "no email"}{" "}
                          {r.code ? `· ${r.code}` : "· no referral code"}
                        </p>
                      </div>
                      {r.code && (
                        <button
                          type="button"
                          onClick={() => handleCopyCode(r.code)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                          aria-label="Copy code"
                        >
                          <Copy size={14} />
                        </button>
                      )}
                      <AdminButton type="button" onClick={() => handleSelectUser(r.userId)}>
                        View
                      </AdminButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Detail panel */}
          {selectedUser && (
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <UserRound size={15} className="text-[#0856DF]" />
                  {selectedUser.user?.username || "User"} — Referral Details
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
                >
                  <ArrowLeft size={13} /> Close
                </button>
              </div>
              {detailLoading ? (
                <AdminLoading message="Loading user details…" />
              ) : (
                <div className="space-y-5 p-5">
                  {/* User + code + wallet summary */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Referral Code
                      </p>
                      <p className="mt-1 truncate font-mono text-sm font-bold text-slate-800">
                        {selectedUser.referral?.code || "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Wallet Balance
                      </p>
                      <p className="mt-1 text-sm font-bold text-emerald-600">
                        {formatPKR((selectedUser.wallet?.balance || 0))}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Times Used
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {selectedUser.referral?.timesUsed || 0}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Total Earned
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {formatPKR((selectedUser.referral?.totalEarned || 0))}
                      </p>
                    </div>
                  </div>

                  {/* Lifetime purchase progress */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span>
                        Lifetime completed spend: Rs{" "}
                        {(selectedUser.lifetimeSpend || 0).toLocaleString()}
                      </span>
                      <span>
                        {selectedUser.progress || 0}% of Rs{" "}
                        {selectedUser.settings?.minLifetimePurchase?.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#C8A84E] to-[#B8943F]"
                        style={{ width: `${Math.min(100, selectedUser.progress || 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Referral relationships */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Referrals Given ({selectedUser.rewardsGiven?.length || 0})
                      </p>
                      {!selectedUser.rewardsGiven?.length ? (
                        <p className="text-xs text-slate-400">None yet</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {selectedUser.rewardsGiven.map((rw: any) => (
                            <li
                              key={rw._id}
                              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"
                            >
                              <span className="text-slate-600">
                                Customer {String(rw.referredUserId).slice(-6)}
                              </span>
                              <span className="font-bold text-slate-800">
                                {formatPKR((rw.amount || 0))} · {rw.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Referrals Received ({selectedUser.rewardsReceived?.length || 0})
                      </p>
                      {!selectedUser.rewardsReceived?.length ? (
                        <p className="text-xs text-slate-400">None yet</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {selectedUser.rewardsReceived.map((rw: any) => (
                            <li
                              key={rw._id}
                              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"
                            >
                              <span className="text-slate-600">
                                Referrer {String(rw.referrerId).slice(-6)}
                              </span>
                              <span className="font-bold text-slate-800">
                                {formatPKR((rw.amount || 0))} · {rw.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Wallet transactions */}
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Wallet Transactions
                    </p>
                    {!selectedUser.transactions?.length ? (
                      <p className="text-xs text-slate-400">No transactions yet</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100">
                        <table className="w-full text-left text-xs">
                          <tbody>
                            {selectedUser.transactions.map((t: any) => (
                              <tr key={t._id} className="border-b border-slate-100">
                                <td className="px-3 py-2">
                                  <span
                                    className={`font-bold ${
                                      t.type === "credit" ? "text-emerald-600" : "text-red-500"
                                    }`}
                                  >
                                    {t.type === "credit" ? "+" : "-"} Rs{" "}
                                    {(t.amount || 0).toLocaleString()}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-500">{t.source}</td>
                                <td className="px-3 py-2 text-slate-400">
                                  {new Date(t.createdAt).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </AdminCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Settings */}
        <AdminCard>
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Gift size={18} className="text-[#0856DF]" /> Program Settings
            </h3>
          </div>
          {!form ? (
            <AdminLoading message="Loading settings…" />
          ) : (
            <form onSubmit={handleSave} className="space-y-5 p-6">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">Referral Program</p>
                  <p className="text-xs text-slate-500">
                    When off, codes cannot be used and no rewards are issued
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((p) => (p ? { ...p, programEnabled: !p.programEnabled } : p))}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    form.programEnabled ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  aria-pressed={form.programEnabled}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      form.programEnabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <AdminLabel>Reward % per referral</AdminLabel>
                  <AdminInput
                    type="number"
                    min={0}
                    max={100}
                    value={form.rewardPercentage}
                    onChange={(e) =>
                      setForm((p) => (p ? { ...p, rewardPercentage: Number(e.target.value) } : p))
                    }
                  />
                </div>
                <div>
                  <AdminLabel>Minimum lifetime purchase (Rs)</AdminLabel>
                  <AdminInput
                    type="number"
                    min={0}
                    value={form.minLifetimePurchase}
                    onChange={(e) =>
                      setForm((p) => (p ? { ...p, minLifetimePurchase: Number(e.target.value) } : p))
                    }
                  />
                </div>
                <div>
                  <AdminLabel>Maximum reward per referral (Rs)</AdminLabel>
                  <AdminInput
                    type="number"
                    min={0}
                    value={form.maxReward}
                    onChange={(e) =>
                      setForm((p) => (p ? { ...p, maxReward: Number(e.target.value) } : p))
                    }
                  />
                </div>
                <div>
                  <AdminLabel>Wallet usage % of subtotal</AdminLabel>
                  <AdminInput
                    type="number"
                    min={0}
                    max={100}
                    value={form.walletUsagePercent}
                    onChange={(e) =>
                      setForm((p) => (p ? { ...p, walletUsagePercent: Number(e.target.value) } : p))
                    }
                  />
                </div>
                <div>
                  <AdminLabel>Reward expiry (months, 0 = never)</AdminLabel>
                  <AdminInput
                    type="number"
                    min={0}
                    value={form.rewardExpiryMonths}
                    onChange={(e) =>
                      setForm((p) => (p ? { ...p, rewardExpiryMonths: Number(e.target.value) } : p))
                    }
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">First-purchase rule</p>
                  <p className="text-xs text-slate-500">
                    Referral codes are only accepted on a customer&apos;s first order
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((p) => (p ? { ...p, firstPurchaseOnly: !p.firstPurchaseOnly } : p))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    form.firstPurchaseOnly ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  aria-pressed={form.firstPurchaseOnly}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      form.firstPurchaseOnly ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </label>

              <div className="flex justify-end border-t border-slate-200 pt-5">
                <AdminButton type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={15} />}
                  Save Settings
                </AdminButton>
              </div>
            </form>
          )}
        </AdminCard>

        {/* Top referrers */}
        <AdminCard>
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Trophy size={18} className="text-amber-500" /> Top Referrers
            </h3>
          </div>
          <AdminTableWrap>
            <table className="w-full min-w-[420px] text-left">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <AdminTh>#</AdminTh>
                  <AdminTh>Referrer</AdminTh>
                  <AdminTh>Referrals</AdminTh>
                  <AdminTh>Total Earned</AdminTh>
                </tr>
              </thead>
              <tbody className="text-sm">
                {!stats?.topReferrers?.length ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                      No credited referrals yet
                    </td>
                  </tr>
                ) : (
                  stats.topReferrers.map((r, i) => (
                    <tr key={r.referrerId} className="border-t border-slate-100 hover:bg-slate-50">
                      <AdminTd className="font-mono text-slate-400">{i + 1}</AdminTd>
                      <AdminTd>
                        <p className="font-semibold text-slate-800">{r.username}</p>
                        <p className="text-xs text-slate-400">{r.email || ""}</p>
                      </AdminTd>
                      <AdminTd>{r.rewards}</AdminTd>
                      <AdminTd className="font-bold text-emerald-600">
                        {formatPKR(r.total)}
                      </AdminTd>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </AdminTableWrap>
        </AdminCard>
      </div>

      {/* Recent rewards */}
      <AdminCard>
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">Recent Rewards</h3>
        </div>
        <AdminTableWrap>
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <AdminTh>Code</AdminTh>
                <AdminTh>Referred Customer</AdminTh>
                <AdminTh>Order Total</AdminTh>
                <AdminTh>Reward</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Date</AdminTh>
              </tr>
            </thead>
            <tbody className="text-sm">
              {!stats?.recentRewards?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    No rewards recorded yet
                  </td>
                </tr>
              ) : (
                stats.recentRewards.map((r: any) => (
                  <tr key={r._id} className="border-t border-slate-100 hover:bg-slate-50">
                    <AdminTd className="font-mono font-semibold text-slate-800">{r.code}</AdminTd>
                    <AdminTd>{r.referredUserId?.username || "—"}</AdminTd>
                    <AdminTd>{formatPKR((r.orderTotal || 0))}</AdminTd>
                    <AdminTd className="font-bold text-emerald-600">
                      {formatPKR((r.amount || 0))}
                    </AdminTd>
                    <AdminTd>
                      <AdminBadge
                        tone={
                          r.status === "credited"
                            ? "emerald"
                            : r.status === "pending"
                              ? "amber"
                              : r.status === "cancelled"
                                ? "red"
                                : "blue"
                        }
                      >
                        {r.status}
                      </AdminBadge>
                    </AdminTd>
                    <AdminTd className="text-slate-500">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </AdminTd>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </AdminTableWrap>
      </AdminCard>

      {/* Wallet transactions */}
      <AdminCard>
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Wallet size={18} className="text-emerald-600" /> Wallet Transactions
          </h3>
        </div>
        <AdminTableWrap>
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <AdminTh>User</AdminTh>
                <AdminTh>Type</AdminTh>
                <AdminTh>Source</AdminTh>
                <AdminTh>Amount</AdminTh>
                <AdminTh>Date</AdminTh>
              </tr>
            </thead>
            <tbody className="text-sm">
              {!stats?.recentTransactions?.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                    No wallet transactions yet
                  </td>
                </tr>
              ) : (
                stats.recentTransactions.map((t: any) => (
                  <tr key={t._id} className="border-t border-slate-100 hover:bg-slate-50">
                    <AdminTd>
                      <p className="font-semibold text-slate-800">
                        {t.userId?.username || "—"}
                      </p>
                      <p className="text-xs text-slate-400">{t.userId?.email || ""}</p>
                    </AdminTd>
                    <AdminTd>
                      <AdminBadge tone={t.type === "credit" ? "emerald" : "red"}>
                        {t.type}
                      </AdminBadge>
                    </AdminTd>
                    <AdminTd className="text-slate-500">{t.source}</AdminTd>
                    <AdminTd
                      className={`font-bold ${
                        t.type === "credit" ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {t.type === "credit" ? "+" : "-"} {formatPKR((t.amount || 0))}
                    </AdminTd>
                    <AdminTd className="text-slate-500">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </AdminTd>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </AdminTableWrap>
      </AdminCard>
    </div>
  );
};

export default ReferralsPage;
