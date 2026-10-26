"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { ChevronDown, Search, X } from "lucide-react";

/* ===========================================================
   SEARCHABLE SELECT DROPDOWN
   A clean, keyboard-friendly searchable dropdown for
   country/city selection. Supports:
   - Type-to-search filtering
   - Keyboard navigation (arrow keys + Enter + Escape)
   - Clear button
   - Mobile-friendly
   =========================================================== */

interface Option {
  label: string;
  value: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  emptyMessage = "No results found",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label || "",
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(-1);
  }, [filtered.length, search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx < 0 || !listRef.current) return;
    const items = listRef.current.children;
    if (items[highlightIdx]) {
      (items[highlightIdx] as HTMLElement).scrollIntoView({
        block: "nearest",
      });
    }
  }, [highlightIdx]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const select = useCallback(
    (val: string) => {
      onChange(val);
      setIsOpen(false);
      setSearch("");
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIdx >= 0 && filtered[highlightIdx]) {
          select(filtered[highlightIdx].value);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearch("");
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((o) => !o);
            setSearch("");
          }
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-[#FAFAF8] px-4 py-3 text-sm font-medium text-left transition-all duration-200 ${
          disabled
            ? "cursor-not-allowed border-[#E0DFDB] opacity-50"
            : isOpen
              ? "border-brand-gold bg-surface ring-2 ring-brand-gold/10"
              : "border-[#E0DFDB] hover:border-brand-gold/40"
        } ${value ? "text-brand-navy" : "text-brand-navy/40"}`}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-brand-navy/40 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-[#E8E7E3] bg-surface shadow-lg">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-[#E8E7E3] px-3 py-2">
            <Search size={14} className="shrink-0 text-brand-navy/30" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              autoFocus
              className="flex-1 bg-transparent text-sm font-medium text-brand-navy outline-none placeholder:text-brand-navy/30"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="rounded p-0.5 text-brand-navy/30 hover:text-brand-navy"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Options list */}
          <div ref={listRef} className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-brand-navy/40">
                {emptyMessage}
              </p>
            ) : (
              filtered.map((opt, idx) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => select(opt.value)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition ${
                    opt.value === value
                      ? "bg-brand-gold/10 font-bold text-brand-gold"
                      : highlightIdx === idx
                        ? "bg-[#F6F5F1] text-brand-navy"
                        : "text-brand-navy hover:bg-[#FAFAF8]"
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
