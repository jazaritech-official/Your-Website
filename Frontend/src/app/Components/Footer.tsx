"use client";

import React from "react";
import Link from "next/link";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { useBranding } from "./ThemeProvider";

const SHOP_LINKS = [
  { name: "All Products", href: "/productsPage" },
  { name: "Featured Items", href: "/productsPage" },
  { name: "New Arrivals", href: "/productsPage?search=new" },
  { name: "Best Sellers", href: "/productsPage?search=best" },
  { name: "Track Order", href: "/track-order" },
];

const INFO_LINKS = [
  { name: "About Us", href: "/#about" },
  { name: "Contact Us", href: "/#contact" },
  { name: "FAQ", href: "#" },
  { name: "Privacy Policy", href: "#" },
  { name: "Terms & Conditions", href: "#" },
];

const SOCIALS = [
  {
    label: "Facebook",
    href: "https://facebook.com/irhasinn",
    icon: Facebook,
    hover: "hover:bg-[#1877F2] hover:border-[#1877F2]",
  },
  {
    label: "Instagram",
    href: "https://instagram.com/irhasinn",
    icon: Instagram,
    hover: "hover:bg-[#E4405F] hover:border-[#E4405F]",
  },
];

const Footer: React.FC = () => {
  // Admin-configured logo / site name (server-provided).
  const { logoUrl, siteName } = useBranding();
  return (
    <footer className="relative bg-brand-navy text-white">
      {/* Brand hairline */}
      <div
        aria-hidden
        className="h-px w-full bg-gradient-to-r from-transparent via-brand-gold/70 to-transparent"
      />

      <div className="mx-auto max-w-7xl px-4 pb-0 pt-14">
        <div className="grid grid-cols-1 gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* ── Brand ── */}
          <div className="space-y-4">
            <Link href="/" className="group inline-flex items-center gap-2.5">
              <img
                src={logoUrl}
                alt={siteName}
                className="h-11 w-auto rounded-lg ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-[1.04]"
              />
              <span className="hidden text-sm font-black uppercase tracking-[0.14em] text-brand-gold sm:inline">
                {siteName}
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-white/55">
              Your destination for customized, personalized products. Quality
              craftsmanship, delivered with care across Pakistan.
            </p>
            <ul className="space-y-2.5 text-sm text-white/55">
              <li className="flex items-start gap-2">
                <MapPin size={15} className="mt-0.5 shrink-0 text-brand-gold" aria-hidden />
                <span>Karachi, Pakistan</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone size={15} className="shrink-0 text-brand-gold" aria-hidden />
                <span>0332-3238544</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={15} className="shrink-0 text-brand-gold" aria-hidden />
                <a
                  href="mailto:Irhasinn@gmail.com"
                  className="transition-colors hover:text-brand-gold"
                >
                  Irhasinn@gmail.com
                </a>
              </li>
            </ul>
          </div>

          {/* ── Shopping ── */}
          <nav aria-labelledby="footer-shop">
            <h3
              id="footer-shop"
              className="mb-5 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            >
              Shopping
            </h3>
            <ul className="space-y-2.5 text-sm">
              {SHOP_LINKS.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="inline-block text-white/55 transition-colors duration-200 hover:text-brand-gold"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ── Information ── */}
          <nav aria-labelledby="footer-info">
            <h3
              id="footer-info"
              className="mb-5 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            >
              Information
            </h3>
            <ul className="space-y-2.5 text-sm">
              {INFO_LINKS.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="inline-block text-white/55 transition-colors duration-200 hover:text-brand-gold"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ── Keep in touch ── */}
          <div>
            <h3 className="mb-5 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
              Let&apos;s Keep in Touch
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-white/55">
              Subscribe for exclusive deals, new arrivals, and trending styles.
            </p>
            <div className="mb-5 flex flex-col gap-3">
              <label htmlFor="footer-email" className="sr-only">
                Email address
              </label>
              <input
                id="footer-email"
                type="email"
                placeholder="Enter your email"
                className="h-11 w-full rounded-field border border-white/10 bg-white/[0.06] px-4 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-brand-gold focus:ring-4 focus:ring-brand-gold/15"
              />
              <button
                type="button"
                className="h-11 w-full rounded-field bg-brand-gold text-[13px] font-bold uppercase tracking-wider text-brand-navy-deep transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-brand-gold-hover hover:shadow-[0_8px_20px_rgba(200,168,78,0.28)] active:scale-[0.98]"
              >
                Subscribe
              </button>
            </div>
            <ul className="flex gap-3">
              {SOCIALS.map(({ label, href, icon: Icon, hover }) => (
                <li key={label}>
                  <Link
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className={`flex h-11 w-11 items-center justify-center rounded-field border border-white/10 bg-white/[0.06] text-white/70 transition-all duration-200 hover:text-white ${hover}`}
                  >
                    <Icon size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="border-t border-white/10 py-6">
          <div className="flex flex-col items-center justify-between gap-4 text-xs text-white/45 md:flex-row">
            <ul className="flex items-center gap-4">
              <li>
                <Link href="/productsPage" className="transition-colors hover:text-white">
                  Contact Us
                </Link>
              </li>
              <li aria-hidden className="text-white/15">
                |
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-white">
                  Help Center
                </Link>
              </li>
              <li aria-hidden className="text-white/15">
                |
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-white">
                  Give Feedback
                </Link>
              </li>
            </ul>
            <p>&copy; {new Date().getFullYear()} Irhas&apos;Inn. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
