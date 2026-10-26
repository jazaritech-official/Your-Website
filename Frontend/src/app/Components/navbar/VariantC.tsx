"use client";

import Logo from "./Logo";
import DesktopNav from "./DesktopNav";
import DesktopSearch from "./DesktopSearch";
import DesktopActions from "./DesktopActions";
import MobileActions from "./MobileActions";
import type { NavbarProps } from "./types";

/* ============================================================
   Navbar Variant C — "Search-first"
   ------------------------------------------------------------
   Single row, but the search field sits directly beside the logo and the
   link row moves to the right. Gives the search box the most prominent
   position in the header.

   Same props, same handlers — only the arrangement differs.
   ============================================================ */

export default function NavbarVariantC(props: NavbarProps) {
  return (
    <nav className={props.tones.navbarClasses}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="flex min-h-[56px] items-center justify-between gap-2 sm:min-h-[64px] sm:gap-4">
          <Logo {...props} />
          <DesktopSearch {...props} />
          <DesktopNav {...props} />
          <DesktopActions {...props} />
          <MobileActions {...props} />
        </div>
      </div>
    </nav>
  );
}
