import { formatPKR } from "@/app/utils/format";
/* ===========================================================
   REFERRAL REWARDS — FRONTEND HELPERS
   Shared types + utility functions used across checkout,
   the Referral Center page, popups and the admin dashboard.
   =========================================================== */

/** Default reward % — kept in sync with the backend defaults (referralService
 *  DEFAULT_SETTINGS, ReferralSettings + ReferralReward model defaults). Used as
 *  the display fallback wherever settings have not loaded yet. */
export const DEFAULT_REWARD_PERCENTAGE = 5;
export interface ReferralSettingsInfo {
  minLifetimePurchase: number;
  rewardPercentage: number;
  maxReward: number;
  walletUsagePercent: number;
  firstPurchaseOnly: boolean;
  rewardExpiryMonths: number;
}

export interface ReferralDoc {
  _id: string;
  userId: string;
  code: string;
  status: "active" | "disabled";
  timesUsed: number;
  totalEarned: number;
}

export interface ReferralWalletDoc {
  _id: string;
  userId: string;
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  pendingRewards: number;
  successfulReferrals: number;
}

export interface WalletTxn {
  _id: string;
  type: "credit" | "debit";
  source: "referral_reward" | "wallet_redeem" | "wallet_refund" | "reward_expiry" | "adjustment";
  amount: number;
  balanceAfter: number;
  orderId?: string | null;
  note?: string;
  createdAt: string;
}

export interface ReferralOverview {
  programEnabled: boolean;
  settings: ReferralSettingsInfo;
  referral: ReferralDoc | null;
  wallet: ReferralWalletDoc | null;
  lifetimeSpend: number;
  remainingToUnlock: number;
  progress: number;
  recentTransactions: WalletTxn[];
  recentRewards: any[];
}

/** Storage key marking that the unlock popup was acknowledged for a user. */
export const referralAckKey = (userId: string) => `irhasinn_referral_ack_${userId}`;

/** Storage key limiting how often the "unlock" landing popup may appear. */
export const REFERRAL_LANDING_SEEN_KEY = "irhasinn_referral_landing_seen";
export const REFERRAL_LANDING_INTERVAL_DAYS = 7;

/** Professional WhatsApp share message (URL-encoded). */
export const buildWhatsAppShareUrl = (code: string) => {
  const text =
    `Hi!%0A%0AI shop at Irhas'Inn.%0AUse my referral code:%0A%0A*${encodeURIComponent(code)}*%0A%0A` +
    `when placing your order — I earn 5% referral rewards when it's delivered!%0A%0AJoin here:%0Ahttps://irhasinn.vercel.app`;
  return `https://wa.me/?text=${text}`;
};

/** Clipboard copy with fallback + fire-and-forget toast handled by caller. */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
};

export const formatRs = (value: number) =>
  `${formatPKR((value || 0))}`;

export const formatDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-PK", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

/** Human label for wallet transaction sources. */
export const walletSourceLabel: Record<string, string> = {
  referral_reward: "Referral Reward",
  wallet_redeem: "Wallet Used",
  wallet_refund: "Wallet Refund",
  reward_expiry: "Reward Expired",
  adjustment: "Adjustment",
};
