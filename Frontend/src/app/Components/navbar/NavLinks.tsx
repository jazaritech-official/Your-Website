"use client";

import Link from "next/link";
import clsx from "clsx";
import { NAV_LINKS } from "./constants";
import type { NavbarProps } from "./types";

/* Desktop nav link items (no wrapper element — the caller supplies the
   container, so the original DOM nesting is preserved exactly).
   Hash links smooth-scroll on the homepage and route-push everywhere else. */
export default function NavLinks({
  tones,
  onDesktopHashLink,
}: Pick<NavbarProps, "tones" | "onDesktopHashLink">) {
  return (
    <>
      {NAV_LINKS.map((link) =>
        link.isHash ? (
          <button
            key={link.name}
            onClick={() => onDesktopHashLink(link.href)}
            className={clsx(
              "relative px-3.5 py-2 text-[13px] font-medium transition-colors duration-200 group",
              tones.linkTone,
            )}
          >
            {link.name}
            <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-brand-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
          </button>
        ) : (
          <Link
            key={link.name}
            href={link.href}
            className={clsx(
              "relative px-3.5 py-2 text-[13px] font-medium transition-colors duration-200 group",
              tones.linkTone,
            )}
          >
            {link.name}
            <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-brand-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
          </Link>
        ),
      )}
    </>
  );
}
