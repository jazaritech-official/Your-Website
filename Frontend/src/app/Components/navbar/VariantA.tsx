"use client";

import Logo from "./Logo";
import DesktopNav from "./DesktopNav";
import DesktopSearch from "./DesktopSearch";
import DesktopActions from "./DesktopActions";
import MobileActions from "./MobileActions";
import type { NavbarProps } from "./types";

/* ============================================================
   Navbar Variant A — "Classic" (the storefront's current header)
   ------------------------------------------------------------
   One row: logo · nav links + Categories · search · actions.
   This is the design that shipped before the variant switcher, so it is
   the default. Do not "tidy" the wrapper classes here — any change is a
   change to the live storefront.
   ============================================================ */

export default function NavbarVariantA(props: NavbarProps) {
  return (
    <nav className={props.tones.navbarClasses}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="flex min-h-[56px] items-center justify-between gap-2 sm:min-h-[64px] sm:gap-4">
          <Logo {...props} />
          <DesktopNav {...props} />
          <DesktopSearch {...props} />
          <DesktopActions {...props} />
          <MobileActions {...props} />
        </div>
      </div>
    </nav>
  );
}
