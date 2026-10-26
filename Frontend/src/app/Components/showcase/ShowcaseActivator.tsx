"use client";

/**
 * Registers the current showcase slug as the ACTIVE brand context when a
 * visitor lands on /store/[slug], so the client brand survives refresh and
 * in-app navigation (cart, checkout, product pages). Runs once on mount;
 * the fetch itself happens in ShowcaseProvider.
 */
import { useEffect } from "react";
import { useShowcase } from "./ShowcaseProvider";

export default function ShowcaseActivator({ slug }: { slug: string }) {
  const { activate, activeSlug } = useShowcase();

  useEffect(() => {
    if (slug && activeSlug !== slug) {
      void activate(slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return null;
}
