"use client";
import { formatPKR } from "@/app/utils/format";

import clsx from "clsx";
import { ChevronDown, Search } from "lucide-react";
import { cloudinaryUrl } from "../../utils/commonFunctions";
import { CATEGORIES } from "./constants";
import type { NavbarProps } from "./types";

/* ─── SEARCH BAR (Desktop) ───
   min-w-0 lets the bar shrink on 768–1024px so the right action buttons
   never push the navbar (and the page) off-screen. */
export default function DesktopSearch({
  searchContainerRef,
  categoryDropdownRef,
  categoryDropdownOpen,
  selectedCategory,
  searchFocused,
  suggestionsOpen,
  suggestions,
  selectedSuggestionIndex,
  searchQuery,
  setSelectedCategory,
  setCategoryDropdownOpen,
  toggleCategoryDropdown,
  setSearchQuery,
  setSearchFocused,
  setSuggestionsOpen,
  setSelectedSuggestionIndex,
  handleSearch,
  handleSearchKeyDown,
  onSuggestionSelect,
  className,
}: Pick<
  NavbarProps,
  | "searchContainerRef"
  | "categoryDropdownRef"
  | "categoryDropdownOpen"
  | "selectedCategory"
  | "searchFocused"
  | "suggestionsOpen"
  | "suggestions"
  | "selectedSuggestionIndex"
  | "searchQuery"
  | "setSelectedCategory"
  | "setCategoryDropdownOpen"
  | "toggleCategoryDropdown"
  | "setSearchQuery"
  | "setSearchFocused"
  | "setSuggestionsOpen"
  | "setSelectedSuggestionIndex"
  | "handleSearch"
  | "handleSearchKeyDown"
  | "onSuggestionSelect"
> & { className?: string }) {
  return (
    <div
      className={clsx("hidden md:flex min-w-0 flex-1 max-w-[380px]", className)}
      ref={searchContainerRef}
    >
      <div className={clsx(
        "relative flex w-full flex-col",
      )}>
        <div className={clsx(
          "flex w-full items-center rounded-lg border bg-surface overflow-hidden transition-colors duration-200",
          searchFocused || suggestionsOpen
            ? "border-brand-gold shadow-[0_0_0_2px_rgba(200,168,78,0.15)]"
            : "border-line hover:border-line"
        )}>
          <div className="relative" ref={categoryDropdownRef}>
            <button
              type="button"
              onClick={toggleCategoryDropdown}
              className="flex items-center gap-1 px-3 py-2 text-[10px] font-bold text-brand-navy border-r border-line-soft hover:bg-surface-muted/30 transition-colors whitespace-nowrap uppercase tracking-wider"
            >
              {selectedCategory}
              <ChevronDown size={9} className={categoryDropdownOpen ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {categoryDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-40 bg-surface border border-line rounded-lg shadow-lg z-50 py-1.5 overflow-hidden animate-dropdown-fade">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setCategoryDropdownOpen(false);
                    }}
                    className={clsx(
                      "w-full text-left px-3.5 py-2 text-[11px] font-semibold hover:bg-surface-muted/30 transition-colors",
                      cat === selectedCategory
                        ? "text-brand-gold bg-brand-gold/5 font-bold"
                        : "text-brand-navy",
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            placeholder="Search products..."
            aria-label="Search products"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs text-brand-navy outline-none placeholder:text-ink-subtle"
            onKeyDown={handleSearchKeyDown}
          />
          <button
            type="button"
            onClick={() => handleSearch()}
            aria-label="Search"
            className="mr-1.5 rounded-lg bg-brand-gold px-2.5 py-2 text-white transition-all duration-150 hover:bg-brand-gold-hover active:scale-95 active:bg-brand-gold-strong"
          >
            <Search size={13} strokeWidth={2.5} />
          </button>
        </div>

        {/* Search Suggestions Dropdown */}
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-line rounded-lg shadow-lg z-50 overflow-hidden animate-dropdown-fade">
            <div className="py-1">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={suggestion._id}
                  onClick={() => onSuggestionSelect(suggestion)}
                  onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                  className={`flex w-full items-center gap-3 px-3.5 py-2.5 transition-colors ${idx === selectedSuggestionIndex ? "bg-surface-muted/30" : "hover:bg-surface-muted/30"}`}
                >
                  <img
                    src={
                      cloudinaryUrl(suggestion.images?.[0]?.url, 300) ||
                      "/carousel/Clothes.jpg"
                    }
                    alt={suggestion.name}
                    className="h-9 w-9 rounded-lg object-cover shrink-0"
                  />
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-semibold text-brand-navy truncate">
                      {suggestion.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] font-bold text-brand-gold">
                        {formatPKR(suggestion.price)}
                      </p>
                      {suggestion.brand && (
                        <span className="text-[9px] text-ink-subtle font-medium">· {suggestion.brand}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-line-soft px-3.5 py-2.5">
              <button
                onClick={() => {
                  setSuggestionsOpen(false);
                  handleSearch();
                }}
                className="w-full text-center text-xs font-semibold text-brand-gold hover:underline"
              >
                View all results for "{searchQuery.trim()}"
              </button>
            </div>
          </div>
        )}

        {/* No results state */}
        {suggestionsOpen && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-line rounded-lg shadow-lg z-50 py-4 px-4 text-center animate-dropdown-fade">
            <p className="text-xs text-ink-muted font-medium">No products found</p>
          </div>
        )}
      </div>
    </div>
  );
}
