"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState } from "../../Redux/store";
import { baseUrl } from "../../utils/commonFunctions";
import {
  REFERRAL_LANDING_INTERVAL_DAYS,
  REFERRAL_LANDING_SEEN_KEY,
  type ReferralOverview,
} from "../../utils/referral";
import ReferralLandingModal from "./ReferralLandingModal";

/**
 * Occasionally (max once per 7 days, dismissible, homepage only) shows the
 * elegant "Spend Rs 9,999 lifetime to unlock referral rewards" popup to
 * logged-in customers who do not yet have referral access.
 */
const ReferralLandingGate = () => {
  const auth = useSelector((state: RootState) => state.auth);
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [overview, setOverview] = useState<ReferralOverview | null>(null);

  useEffect(() => {
    // Homepage only — never interrupt browsing/checkout on other pages.
    if (pathname !== "/") return;
    if (!auth.username || !auth._id) return;

    let cancelled = false;
    let timer: number | undefined;

    (async () => {
      try {
        // Frequency gate: at most once per N days.
        const seenRaw = window.localStorage.getItem(REFERRAL_LANDING_SEEN_KEY);
        const seen = seenRaw ? Number(seenRaw) : 0;
        if (seen && Date.now() - seen < REFERRAL_LANDING_INTERVAL_DAYS * 24 * 60 * 60 * 1000) {
          return;
        }

        const res = await axios.get(`${baseUrl}referral/overview`, {
          withCredentials: true,
        });
        const ov = res.data?.data as ReferralOverview | undefined;
        if (cancelled || !ov) return;

        // Only for users WITHOUT referral access, and only when the program is on.
        if (!ov.referral?.code && ov.programEnabled) {
          setOverview(ov);
          // Delay so it never interrupts the very first interaction.
          timer = window.setTimeout(() => setShow(true), 7000);
        }
      } catch {
        // Non-critical — never break the home page.
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [auth.username, auth._id, pathname]);

  return (
    <ReferralLandingModal
      open={show}
      minLifetimePurchase={overview?.settings?.minLifetimePurchase || 9999}
      lifetimeSpend={overview?.lifetimeSpend || 0}
      progress={overview?.progress || 0}
      onClose={() => setShow(false)}
    />
  );
};

export default ReferralLandingGate;
