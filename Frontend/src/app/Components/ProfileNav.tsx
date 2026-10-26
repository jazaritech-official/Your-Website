"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, Gift, Package, User } from "lucide-react";
import { DUR_COMPONENT, EASE_STANDARD } from "../utils/motion";

/* ═══════════════════════════════════════════════════════════════
 * ProfileNav — shared account navigation for every /profile surface.
 *
 * Before this existed each account page hand-rolled its own "Back to
 * Profile" link, so there was no way to move sideways between the
 * account sections. This is presentation + navigation only: it renders
 * <Link>s to the SAME routes those pages already used, and reads the
 * existing pathname to mark the active section.
 *
 * The Referral tab is hidden when the referral program is switched off
 * in admin settings — the flag is passed in by the page that already
 * fetched it (`programEnabled`), so no page hardcodes it visible.
 * ═══════════════════════════════════════════════════════════════ */

export interface ProfileNavProps {
  /** Hide the Referral tab when the admin has the program switched off. */
  referralEnabled?: boolean;
  className?: string;
}

interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  /** paths that should mark this item active */
  match: (pathname: string) => boolean;
}

const ITEMS: NavItem[] = [
  {
    key: "overview",
    href: "/profile",
    label: "Overview",
    icon: User,
    match: (p) => p === "/profile" || p === "/profile/",
  },
  {
    key: "orders",
    href: "/profile/orders",
    label: "Orders",
    icon: Package,
    match: (p) => p.startsWith("/profile/orders"),
  },
  {
    key: "notifications",
    href: "/profile/notifications",
    label: "Notifications",
    icon: Bell,
    match: (p) => p.startsWith("/profile/notifications"),
  },
  {
    key: "referral",
    href: "/profile/referral",
    label: "Referral",
    icon: Gift,
    match: (p) => p.startsWith("/profile/referral"),
  },
];

export const ProfileNav: React.FC<ProfileNavProps> = ({
  referralEnabled = true,
  className = "",
}) => {
  const pathname = usePathname() || "";
  const items = ITEMS.filter((i) => i.key !== "referral" || referralEnabled);

  return (
    <nav
      aria-label="Account sections"
      className={`mb-6 overflow-hidden rounded-card border border-line bg-surface shadow-card ${className}`}
    >
      <ul className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(({ key, href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={key} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[52px] items-center justify-center gap-2 whitespace-nowrap px-4 text-[13px] font-semibold transition-[background-color,color,transform] duration-200 ease-[var(--ease-brand)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-gold sm:px-5 ${
                  active
                    ? "bg-brand-gold/12 text-brand-navy"
                    : "text-ink-muted hover:bg-surface-muted hover:text-brand-navy"
                }`}
              >
                <Icon size={15} className={active ? "text-brand-gold-hover" : ""} />
                {/* Labels stay visible at 320px — the row scrolls instead of
                    squeezing the text away. */}
                <span>{label}</span>
                {active && (
                  <motion.span
                    aria-hidden
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: DUR_COMPONENT, ease: EASE_STANDARD }}
                    className="absolute inset-x-0 bottom-0 h-0.5 origin-center bg-brand-gold"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default ProfileNav;
