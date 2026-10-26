"use client";

import Link from "next/link";
import clsx from "clsx";
import type { NavbarProps } from "./types";

/* Desktop logo lockup — brand image + site name + tagline. Moved verbatim. */
export default function Logo({
  logoUrl,
  siteName,
  tagline,
  tones,
  className,
}: Pick<NavbarProps, "logoUrl" | "siteName" | "tagline" | "tones"> & {
  className?: string;
}) {
  return (
    <Link
      href="/"
      className={clsx("flex items-center gap-2 sm:gap-2.5 shrink-0 group", className)}
    >
      <img
        src={logoUrl}
        alt={siteName}
        className="h-10 w-auto sm:h-12 object-contain"
      />
      <div className="flex flex-col">
        <span
          className={clsx(
            "text-sm sm:text-base font-bold tracking-tight transition-colors duration-300 leading-tight",
            tones.brandTone,
          )}
        >
          {siteName}
        </span>
        <span className={clsx(
          "text-[8px] sm:text-[9px] font-semibold tracking-wider uppercase transition-colors duration-300 leading-tight",
          tones.taglineTone,
        )}>
          {tagline}
        </span>
      </div>
    </Link>
  );
}
