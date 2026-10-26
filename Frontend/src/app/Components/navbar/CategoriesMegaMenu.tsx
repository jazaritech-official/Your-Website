"use client";

import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cloudinaryUrl } from "../../utils/commonFunctions";
import type { NavbarProps } from "./types";

/* ─── CATEGORIES MEGA-MENU (Desktop hover) ───
   Full viewport-width panel instead of a fixed 560px box, so it reads as a
   full-screen mega-menu. Positioned with `fixed left-0 right-0` (NOT
   w-screen/100vw) so the panel spans exactly the viewport without ever
   exceeding it by the scrollbar width — 100vw includes the scrollbar and
   produced horizontal overflow. It keeps its static `top`, so it still sits
   right below the Categories button regardless of whether the top contact
   strip / notification banner are visible.
   Categories are laid out as a responsive grid of columns (instead of one
   stacked list) so the full width is actually used, with subcategories shown
   inline under each category — same data, same links, same onClick behavior,
   only the layout container changed. */
export default function CategoriesMegaMenu({
  tones,
  onDark,
  categoriesMenuOpen,
  categoriesMenuRef,
  navCategories,
  toggleCategoriesMenu,
  setCategoriesMenuOpen,
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
> & { className?: string }) {
  return (
    <div
      ref={categoriesMenuRef}
      className={clsx("relative", className)}
      onMouseEnter={() => setCategoriesMenuOpen(true)}
      onMouseLeave={() => setCategoriesMenuOpen(false)}
    >
      <button
        onClick={toggleCategoriesMenu}
        aria-expanded={categoriesMenuOpen}
        aria-haspopup="true"
        className={clsx(
          "relative flex items-center gap-1 px-3.5 py-2 text-[13px] font-medium transition-colors duration-200 group",
          tones.linkTone,
          categoriesMenuOpen && (onDark ? "text-white" : "text-brand-gold-hover"),
        )}
      >
        Categories
        <ChevronDown
          size={12}
          className={`transition-transform duration-300 ${categoriesMenuOpen ? "rotate-180" : ""}`}
        />
      </button>

      {categoriesMenuOpen && (
        <div className="fixed left-0 right-0 top-auto z-50 animate-dropdown-fade border-t border-line bg-surface text-brand-navy shadow-xl shadow-black/10">
          <div className="mx-auto max-h-[80vh] max-w-7xl overflow-y-auto px-6 py-8 sm:px-8">
            {navCategories.length === 0 ? (
              <p className="px-3 py-10 text-center text-xs font-medium text-ink-subtle">
                No categories yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {navCategories.map((cat) => {
                  const subs = cat.subcategories || [];
                  return (
                    <div key={cat._id} className="min-w-0">
                      <Link
                        href={`/productsPage?category=${cat._id}`}
                        onClick={() => setCategoriesMenuOpen(false)}
                        className="mb-3 flex items-center gap-2.5 border-b border-line-soft pb-3 transition-colors hover:text-brand-gold"
                      >
                        <img
                          src={cloudinaryUrl(cat.image, 120) || "/carousel/Clothes.jpg"}
                          alt={cat.name}
                          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-surface-muted"
                        />
                        <span className="truncate text-xs font-black uppercase tracking-wide">
                          {cat.name}
                        </span>
                        {subs.length > 0 && (
                          <span className="shrink-0 rounded-full bg-brand-gold/10 px-2 py-0.5 text-[9px] font-bold text-brand-gold">
                            {subs.length}
                          </span>
                        )}
                        <ChevronRight size={13} className="ml-auto shrink-0 text-ink-subtle" />
                      </Link>
                      {subs.length > 0 ? (
                        <div className="space-y-0.5">
                          {subs.map((sub) => (
                            <Link
                              key={sub._id}
                              href={`/productsPage?category=${cat._id}&subcategory=${sub._id}`}
                              onClick={() => setCategoriesMenuOpen(false)}
                              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-gold/10 group/sub"
                            >
                              <img
                                src={cloudinaryUrl(sub.image, 80) || "/carousel/Clothes.jpg"}
                                alt={sub.name}
                                className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-surface-muted"
                              />
                              <span className="truncate text-[11px] font-semibold text-slate-600 transition-colors group-hover/sub:text-brand-navy">
                                {sub.name}
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="px-2 text-[11px] text-ink-subtle">No subcategories</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
