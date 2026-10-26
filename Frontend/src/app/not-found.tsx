"use client";
import { formatPKR } from "@/app/utils/format";

import React, { useState, useRef, useEffect, FormEvent } from "react";
import Link from "next/link";
import { Search, ArrowLeft, Package, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { baseUrl, cloudinaryUrl } from "./utils/commonFunctions";
import axios from "axios";
import { buttonStyles } from "./Components/ui";
import { useBranding } from "./Components/ThemeProvider";

interface SearchSuggestion {
  _id: string;
  name: string;
  price?: number;
  images?: { url: string }[];
}

export default function NotFound() {
  // Admin-configured logo / site name (server-provided).
  const { logoUrl, siteName } = useBranding();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  const handleSearch = (event?: FormEvent) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setSuggestionsOpen(false);
    const params = `search=${encodeURIComponent(query)}`;
    router.push(`/productsPage?${params}`);
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setSuggestionsOpen(false);
    setSearchQuery("");
    router.push(`/product/${suggestion._id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSuggestionClick(suggestions[selectedIndex]);
      } else {
        handleSearch();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Escape") {
      setSuggestionsOpen(false);
    }
  };

  const fetchSuggestions = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    try {
      const res = await axios.get(
        `${baseUrl}product/search-suggestions?q=${encodeURIComponent(query)}&limit=8`
      );
      const items = res.data?.data || [];
      setSuggestions(Array.isArray(items) ? items : []);
      setSuggestionsOpen(true);
      setSelectedIndex(-1);
    } catch {
      setSuggestions([]);
      setSuggestionsOpen(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (searchDebounce) clearTimeout(searchDebounce);
    const timer = setTimeout(() => fetchSuggestions(value.trim()), 300);
    setSearchDebounce(timer);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <main className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-20 bg-surface">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-10 ir-fade-in-up" style={{ animationDelay: "0ms" }}>
          <div className="relative inline-block mb-6">
            {/* Static gold halo — replaces the previous infinite blur pulse. */}
            <div
              aria-hidden
              className="absolute -inset-3 rounded-2xl bg-brand-gold/[0.08] ring-1 ring-brand-gold/15"
            />
            <img
              src={logoUrl}
              alt={siteName}
              className="relative h-20 w-auto rounded-card border border-brand-gold/30 object-contain shadow-card"
            />
          </div>
        </div>

        <div className="mb-8 ir-fade-in-up" style={{ animationDelay: "100ms" }}>
          <span className="text-8xl sm:text-9xl font-black text-brand-gold tracking-tight leading-none">404</span>
        </div>

        <div className="mb-6 ir-fade-in-up" style={{ animationDelay: "200ms" }}>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-navy mb-2">
            This page has wandered off our shelves
          </h1>
          <p className="text-ink-muted text-lg max-w-md mx-auto leading-relaxed">
            We couldn't find what you're looking for. It might have been moved, removed, or never existed in the first place.
          </p>
        </div>

        <div className="mb-10 ir-fade-in-up" style={{ animationDelay: "300ms" }}>
          <div className="relative max-w-md mx-auto" ref={searchContainerRef}>
            <form onSubmit={handleSearch} className="relative">
              <div className={`
                flex w-full items-center rounded-xl border bg-surface shadow-sm overflow-hidden transition-all duration-300
                ${searchFocused || suggestionsOpen
                  ? "border-brand-gold shadow-[0_0_0_3px_rgba(200,168,78,0.1)]"
                  : "border-line hover:border-line hover:shadow-md"
                }
              `}>
                <Search className="ml-4 text-ink-subtle shrink-0" size={20} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                  placeholder="Search for products..."
                  className="flex-1 bg-transparent px-4 py-3.5 text-base text-brand-navy outline-none placeholder:text-ink-subtle"
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                  aria-label="Search products"
                  aria-autocomplete="list"
                  aria-controls="search-suggestions"
                  aria-expanded={suggestionsOpen && suggestions.length > 0}
                />
                <button
                  type="submit"
                  className="bg-brand-gold hover:bg-brand-gold-hover active:bg-[#A8882E] text-white mr-3 px-4 rounded-full py-3.5 transition-all duration-200 hover:px-6"
                  aria-label="Search"
                >
                  <Search size={16} strokeWidth={2.5} />
                </button>
              </div>

              {suggestionsOpen && suggestions.length > 0 && (
                <div
                  id="search-suggestions"
                  className="absolute top-full left-0 right-0 mt-2 bg-surface border border-line-soft rounded-xl shadow-xl z-50 overflow-hidden ir-fade-in-up"
                  role="listbox"
                >
                  <div className="py-1">
                    {suggestions.map((suggestion: SearchSuggestion, idx: number) => (
                      <button
                        key={suggestion._id}
                        onClick={() => handleSuggestionClick(suggestion)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex w-full items-center gap-3 px-4 py-3 transition-colors ${
                          idx === selectedIndex ? "bg-surface-muted/30" : "hover:bg-surface-muted/30"
                        }`}
                        role="option"
                        aria-selected={idx === selectedIndex}
                      >
                        <img
                          src={cloudinaryUrl(suggestion.images?.[0]?.url, 120) || "/carousel/Clothes.jpg"}
                          alt={suggestion.name}
                          className="h-10 w-10 rounded-lg object-cover shrink-0"
                        />
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-semibold text-brand-navy truncate">
                            {suggestion.name}
                          </p>
                          <p className="text-xs font-bold text-brand-gold">
                            {formatPKR(suggestion.price)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-line-soft px-4 py-3">
                    <button
                      type="button"
                      onClick={handleSearch}
                      className="w-full text-center text-sm font-semibold text-brand-gold hover:underline"
                    >
                      View all results for &ldquo;{searchQuery.trim()}&rdquo;
                    </button>
                  </div>
                </div>
              )}

              {suggestionsOpen && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-line-soft rounded-xl shadow-xl z-50 py-4 px-4 text-center ir-fade-in-up">
                  <p className="text-sm text-ink-muted font-medium">No products found</p>
                </div>
              )}
            </form>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 ir-fade-in-up sm:flex-row" style={{ animationDelay: "400ms" }}>
          <Link
            href="/"
            className={buttonStyles({ variant: "gold", size: "lg", className: "group" })}
          >
            <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-1" />
            Back to Home
          </Link>
          <Link
            href="/productsPage"
            className={buttonStyles({ variant: "outline", size: "lg", className: "group" })}
          >
            Browse Products
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="mt-16 ir-fade-in-up" style={{ animationDelay: "500ms" }}>
          <div className="flex items-center justify-center gap-8 text-ink-subtle text-sm">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-brand-gold" />
              <span>Curated Collections</span>
            </div>
            <div className="flex items-center gap-2">
              <Package size={16} className="text-brand-gold" />
              <span>Personalized Gifts</span>
            </div>
            <div className="flex items-center gap-2">
              <Package size={16} className="text-brand-gold" />
              <span>Fast Delivery</span>
            </div>
          </div>
        </div>
      </div>

    </main>
  );
}