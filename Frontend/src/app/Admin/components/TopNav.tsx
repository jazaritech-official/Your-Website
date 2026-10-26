"use client";

import { Bell, Menu, Search } from "lucide-react";

const TopNav = ({
  title,
  onMenuClick,
}: {
  title: string;
  onMenuClick?: () => void;
}) => {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-gray-200 bg-white/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[#111827] sm:text-xl">
            {title}
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search…"
            className="w-56 rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm font-medium text-[#111827] outline-none transition placeholder:text-gray-400 focus:border-[#C9A227] focus:bg-white focus:ring-2 focus:ring-[#C9A227]/15 lg:w-72"
          />
        </div>

        <button className="relative rounded-lg border border-gray-200 p-2.5 text-gray-600 transition hover:bg-gray-50">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#DC2626] text-[9px] font-bold text-white ring-2 ring-white">
          </span>
        </button>
      </div>
    </header>
  );
};

export default TopNav;
