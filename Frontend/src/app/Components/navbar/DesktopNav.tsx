"use client";

import clsx from "clsx";
import NavLinks from "./NavLinks";
import CategoriesMegaMenu from "./CategoriesMegaMenu";
import type { NavbarProps } from "./types";

/* The desktop "links + Categories mega-menu" unit. Kept as ONE element
   because the mega-menu is positioned relative to the link row — splitting
   them would change the original DOM nesting. Variants may reposition this
   whole block via `className`. */
export default function DesktopNav({
  tones,
  onDark,
  categoriesMenuOpen,
  categoriesMenuRef,
  navCategories,
  toggleCategoriesMenu,
  setCategoriesMenuOpen,
  onDesktopHashLink,
  className,
}: Pick<
  NavbarProps,
  | "tones"
  | "onDark"
  | "categoriesMenuOpen"
  | "categoriesMenuRef"
  | "navCategories"
  | "toggleCategoriesMenu"
  | "setCategoriesMenuOpen"
  | "onDesktopHashLink"
> & { className?: string }) {
  return (
    <div className={clsx("hidden lg:flex items-center gap-0.5", className)}>
      <NavLinks tones={tones} onDesktopHashLink={onDesktopHashLink} />
      <CategoriesMegaMenu
        tones={tones}
        onDark={onDark}
        categoriesMenuOpen={categoriesMenuOpen}
        categoriesMenuRef={categoriesMenuRef}
        navCategories={navCategories}
        toggleCategoriesMenu={toggleCategoriesMenu}
        setCategoriesMenuOpen={setCategoriesMenuOpen}
      />
    </div>
  );
}
