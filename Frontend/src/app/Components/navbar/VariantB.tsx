"use client";

import Logo from "./Logo";
import DesktopNav from "./DesktopNav";
import DesktopSearch from "./DesktopSearch";
import DesktopActions from "./DesktopActions";
import MobileActions from "./MobileActions";
import type { NavbarProps } from "./types";

/* ============================================================
   Navbar Variant B — "Two-row"
   ------------------------------------------------------------
   Top row: logo + actions. Second row (md and up): the link row and the
   search field get the full viewport width. On phones the second row is
   hidden entirely, so the mobile header is identical to Variant A.

   Same props, same handlers — only the arrangement differs.
   ============================================================ */

export default function NavbarVariantB(props: NavbarProps) {
  return (
    <nav className={props.tones.navbarClasses}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="flex min-h-[56px] items-center justify-between gap-2 sm:min-h-[64px] sm:gap-4">
          <Logo {...props} />
          <DesktopActions {...props} />
          <MobileActions {...props} />
        </div>
        <div className="hidden md:flex items-center gap-4 pb-2">
          <DesktopNav {...props} />
          <DesktopSearch {...props} />
        </div>
      </div>
    </nav>
  );
}
