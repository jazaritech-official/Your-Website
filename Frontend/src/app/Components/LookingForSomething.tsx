"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, TrendingUp } from "lucide-react";

const quickTags = [
  "Customized T-Shirts",
  "Printed Mugs",
  "Cricket Jerseys",
  "Birthday Gifts",
  "Corporate Uniforms",
  "Photo Frames",
  "Keychains",
  "Hoodies",
];

const LookingForSomething: React.FC = () => {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchValue.trim();
    if (!query) return;
    router.push(`/productsPage?search=${encodeURIComponent(query)}`);
  };

  const handleTagClick = (tag: string) => {
    router.push(`/productsPage?search=${encodeURIComponent(tag)}`);
  };

  return (
    <section className="bg-surface-page/72 py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 text-center">
        {/* Decorative top line */}
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="h-px w-8 bg-brand-gold" />
          <TrendingUp size={14} className="text-brand-gold-hover" />
          <span className="h-px w-8 bg-brand-gold" />
        </div>

        {/* Heading */}
        <span className="mb-3 inline-block text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold-hover">
          Need Help Finding Something?
        </span>
        <h2 className="mb-3 text-2xl font-black leading-tight tracking-tight text-brand-navy md:text-4xl">
          Looking for Something <span className="relative">
            <span className="text-brand-gold-hover">Else?</span>
            <span className="absolute -bottom-1 left-0 right-0 h-1 rounded-full bg-brand-gold/25" />
          </span>
        </h2>
        <p className="mx-auto mb-8 max-w-lg text-sm leading-relaxed text-ink-muted">
          Can&apos;t find what you&apos;re looking for? Search below or browse our popular categories to discover exactly what you need.
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="relative mb-10 max-w-xl mx-auto">
          <div className="flex items-center overflow-hidden rounded-field border border-line bg-surface shadow-card transition-[border-color,box-shadow] duration-300 focus-within:border-brand-gold focus-within:ring-4 focus-within:ring-brand-gold/15 hover:border-brand-gold/40">
            <div className="pl-4 pr-2 text-ink-subtle">
              <Search size={18} aria-hidden />
            </div>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search for any product..."
              aria-label="Search products"
              autoComplete="off"
              className="flex-1 bg-transparent py-3.5 pr-2 text-sm text-brand-navy outline-none placeholder:text-ink-subtle"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 bg-brand-gold px-5 py-3.5 text-sm font-bold text-white transition-[background-color,transform] active:scale-[0.98] active:bg-[#A8882E] hover:bg-brand-gold-hover"
            >
              <span>Search</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </form>

        {/* Quick Tags */}
        <div className="flex flex-wrap justify-center gap-2.5">
          {quickTags.map((tag, i) => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              style={{ animationDelay: `${i * 50}ms` }}
              className="animate-fade-in rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink-muted transition-[border-color,color,background-color,transform] duration-200 hover:border-brand-gold hover:bg-brand-gold/5 hover:text-brand-gold-hover active:scale-95"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

    </section>
  );
};

export default LookingForSomething;
