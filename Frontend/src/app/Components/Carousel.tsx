"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Play,
  Pause,
} from "lucide-react";
import { baseUrl } from "../utils/commonFunctions";
import { AnimatePresence, motion, Variants } from "framer-motion";
import { buttonHover, buttonTap } from "../utils/motion";
import { buttonStyles } from "./ui";

interface Slide {
  _id: string;
  image: string;
  tag: string;
  title: string;
  subtitle: string;
}

const AUTO_PLAY_MS = 6000;

/*
============================================================
PROGRESS INDICATOR
============================================================
Purely presentational: it owns the 50 ms ticking state so the ~20 Hz
updates re-render this single element instead of the whole carousel
subtree (slides, arrows, dots, next/image). It is mounted with
`key={currentIndex}`, so every slide change remounts it and the bar
starts again at 0 — exactly the timing the parent used to drive.
Pausing freezes the bar in place; resuming restarts it from 0, which is
the pre-existing behaviour.
*/

const CarouselProgress = ({ paused }: { paused: boolean }) => {
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (!paused) setRunId((n) => n + 1);
  }, [paused]);

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 h-[3px] bg-surface/10">
      <div
        key={runId}
        className="ir-carousel-progress h-full bg-brand-gold"
        style={{
          animationDuration: `${AUTO_PLAY_MS}ms`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
    </div>
  );
};

/*
============================================================
TRANSITION LIBRARY
============================================================
Four distinct, GPU-only (transform / opacity / clip-path) entrance-exit
pairs, cycled deterministically by slide index so the hero never repeats
the same move twice in a row on a typical 3–5 slide set, without ever
feeling random. Each variant is a self-contained motion recipe; the
active slide is the ONLY one mounted at a time (AnimatePresence), which
is what makes anything beyond a simple crossfade possible.
*/

type TransitionKind = "kenburns" | "slide" | "reveal" | "tilt";

const TRANSITION_ORDER: TransitionKind[] = [
  "kenburns",
  "slide",
  "reveal",
  "tilt",
];

const EASE_SMOOTH: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_SNAPPY: [number, number, number, number] = [0.22, 1, 0.36, 1];

const kenburnsVariants: Variants = {
  enter: { opacity: 0, scale: 1.14 },
  center: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
};

const slideVariants: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? "8%" : "-8%",
    scale: 1.03,
  }),
  center: { opacity: 1, x: "0%", scale: 1 },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? "-6%" : "6%",
    scale: 1.01,
  }),
};

const revealVariants: Variants = {
  enter: {
    opacity: 1,
    clipPath: "polygon(0 0, 0 0, 0 100%, 0 100%)",
  },
  center: {
    opacity: 1,
    clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
  },
  exit: {
    opacity: 1,
    clipPath: "polygon(100% 0, 100% 0, 100% 100%, 100% 100%)",
  },
};

const tiltVariants: Variants = {
  enter: { opacity: 0, scale: 1.18, rotate: 1.5 },
  center: { opacity: 1, scale: 1, rotate: 0 },
  exit: { opacity: 0, scale: 0.92, rotate: -1.5 },
};

const VARIANT_MAP: Record<TransitionKind, Variants> = {
  kenburns: kenburnsVariants,
  slide: slideVariants,
  reveal: revealVariants,
  tilt: tiltVariants,
};

const TRANSITION_TIMING: Record<
  TransitionKind,
  { duration: number; ease: [number, number, number, number] }
> = {
  kenburns: { duration: 1.1, ease: EASE_SMOOTH },
  slide: { duration: 0.85, ease: EASE_SNAPPY },
  reveal: { duration: 0.95, ease: EASE_SMOOTH },
  tilt: { duration: 1, ease: EASE_SMOOTH },
};

const Carousel = () => {
  const router = useRouter();

  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  /*
  ============================================================
  FETCH CAROUSEL SLIDES
  ============================================================
  */

  useEffect(() => {
    const fetchSlides = async () => {
      try {
        const res = await axios.get(
          `${baseUrl}homepage-banners?type=carousel`
        );

        const data = res.data?.data;

        if (Array.isArray(data) && data.length > 0) {
          const formattedSlides: Slide[] = data.map(
            (banner: any): Slide => ({
              _id: banner._id,
              image: banner.image,
              tag: banner.tag || "Featured Collection",
              title: banner.title || "Premium Collection",
              subtitle:
                banner.subtitle ||
                "Discover our curated collection of premium products.",
            })
          );

          setSlides(formattedSlides);
        }
      } catch (error) {
        console.error("Failed to fetch carousel slides:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSlides();
  }, []);

  /*
  ============================================================
  NEXT / PREV / GOTO — each now also records a direction, which the
  "slide" transition variant reads to decide which way to travel.
  ============================================================
  */

  const next = useCallback(() => {
    if (slides.length <= 1 || isTransitioning) return;

    setDirection(1);
    setIsTransitioning(true);
    setCurrentIndex((previous) =>
      previous === slides.length - 1 ? 0 : previous + 1
    );

    window.setTimeout(() => setIsTransitioning(false), 650);
  }, [slides.length, isTransitioning]);

  const prev = useCallback(() => {
    if (slides.length <= 1 || isTransitioning) return;

    setDirection(-1);
    setIsTransitioning(true);
    setCurrentIndex((previous) =>
      previous === 0 ? slides.length - 1 : previous - 1
    );

    window.setTimeout(() => setIsTransitioning(false), 650);
  }, [slides.length, isTransitioning]);

  const goToSlide = useCallback(
    (index: number) => {
      if (index === currentIndex || isTransitioning || slides.length <= 1) {
        return;
      }

      setDirection(index > currentIndex ? 1 : -1);
      setIsTransitioning(true);
      setCurrentIndex(index);

      window.setTimeout(() => setIsTransitioning(false), 650);
    },
    [currentIndex, isTransitioning, slides.length]
  );

  /*
  ============================================================
  AUTO PLAY
  ============================================================
  */

  useEffect(() => {
    if (slides.length <= 1 || isPaused) return;

    const timer = window.setInterval(() => {
      setDirection(1);
      setCurrentIndex((previous) =>
        previous === slides.length - 1 ? 0 : previous + 1
      );
    }, AUTO_PLAY_MS);

    return () => window.clearInterval(timer);
  }, [slides.length, isPaused, currentIndex]);

  /*
  ============================================================
  KEYBOARD NAVIGATION
  ============================================================
  */

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") prev();
      if (event.key === "ArrowRight") next();
    };

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [next, prev]);

  /*
  ============================================================
  TOUCH / SWIPE
  ============================================================
  */

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    touchEndX.current = event.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;

    const distance = touchStartX.current - touchEndX.current;
    const minimumSwipeDistance = 50;

    if (Math.abs(distance) >= minimumSwipeDistance) {
      if (distance > 0) next();
      else prev();
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  /*
  ============================================================
  LOADING STATE
  ============================================================
  */

  if (loading) {
    return (
      <section className="w-full bg-surface/72">
        <div className="mx-auto max-w-[1440px] px-3 py-4 sm:px-5 md:px-6 lg:py-7">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.75fr)]">
            <div className="h-[360px] animate-pulse rounded-[24px] bg-[#eef0f3] sm:h-[460px] lg:h-[570px]" />

            <div className="hidden gap-3 lg:flex lg:flex-col">
              <div className="flex-1 animate-pulse rounded-[24px] bg-[#eef0f3]" />
              <div className="flex-1 animate-pulse rounded-[24px] bg-[#eef0f3]" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  /*
  ============================================================
  EMPTY STATE
  ============================================================
  */

  if (slides.length === 0) {
    return (
      <section className="relative w-full overflow-hidden bg-[#171c24]">
        <div className="absolute inset-0 opacity-[0.04]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(#ffffff 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
        </div>

        <div className="relative mx-auto flex min-h-[420px] max-w-7xl items-center justify-center px-5 py-20 text-center">
          <div className="max-w-2xl">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-gold/20 bg-brand-gold/10">
              <Sparkles size={24} className="text-brand-gold" />
            </div>

            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">
              Irhas&apos;Inn
            </p>

            <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
              Discover Something
              <span className="text-brand-gold"> Special</span>
            </h1>

            <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-white/55">
              Discover premium customized products crafted specially for you.
            </p>

            <motion.button
              type="button"
              onClick={() => router.push("/productsPage")}
              whileHover={{ ...buttonHover }}
              whileTap={{ ...buttonTap }}
              className={buttonStyles({
                variant: "gold",
                size: "lg",
                className: "mt-7 uppercase tracking-[0.12em]",
              })}
            >
              Explore Collection
              <ArrowRight size={15} />
            </motion.button>
          </div>
        </div>
      </section>
    );
  }

  const activeSlide = slides[currentIndex];
  const secondarySlides = slides.filter((_, index) => index !== currentIndex);
  const transitionKind =
    TRANSITION_ORDER[currentIndex % TRANSITION_ORDER.length];
  const timing = TRANSITION_TIMING[transitionKind];

  /*
  ============================================================
  MAIN UI
  ============================================================
  */

  return (
    <section className="w-full bg-surface/72">
      <div className="mx-auto max-w-[1440px] px-3 py-3 sm:px-5 sm:py-5 md:px-6 lg:py-7">
        <div
          className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.75fr)]"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* ==================================================
              MAIN HERO
          ================================================== */}

          <div className="group relative min-h-[390px] overflow-hidden rounded-[24px] bg-[#171c24] shadow-[0_18px_55px_rgba(23,28,36,0.16)] sm:min-h-[480px] lg:min-h-[570px]">
            {/* SLIDE LAYER — only the active slide is ever mounted, so the
                enter/exit pair defined per transitionKind fully controls how
                it arrives and leaves. This is what makes more than a plain
                crossfade possible. */}

            <AnimatePresence initial={false} custom={direction} mode="sync">
              <motion.div
                key={activeSlide._id}
                custom={direction}
                variants={VARIANT_MAP[transitionKind]}
                initial="enter"
                animate="center"
                exit="exit"
                transition={timing}
                className="absolute inset-0"
              >
                {/* Blurred atmospheric background fill */}
                <Image
                  src={activeSlide.image}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 100vw, 75vw"
                  className="scale-110 object-cover blur-[28px]"
                />

                <div className="absolute inset-0 bg-[#171c24]/35" />

                {/* Main image — a slow, continuous ambient zoom runs the
                    whole time a slide is centered (Ken Burns feel on every
                    variant, not just the "kenburns" one), independent of
                    the enter/exit motion above. */}
                <motion.div
                  className="absolute inset-0"
                  initial={{ scale: 1 }}
                  animate={{ scale: 1.07 }}
                  transition={{ duration: 7, ease: "linear" }}
                >
                  <Image
                    src={activeSlide.image}
                    alt={activeSlide.title}
                    fill
                    priority={currentIndex === 0}
                    sizes="(max-width: 1024px) 100vw, 75vw"
                    className="object-cover"
                  />
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* PREMIUM DARK OVERLAY */}

            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/85 via-black/25 to-black/5" />

            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-black/55 via-black/10 to-transparent" />

            {/* TOP GLASS STATUS */}

            <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6">
              <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-2 backdrop-blur-xl">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-gold opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-gold" />
                </span>

                <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/80 sm:text-[9px]">
                  Featured
                </span>
              </div>
            </div>

            {/* PAUSE / PLAY */}

            <button
              type="button"
              aria-label={isPaused ? "Resume carousel" : "Pause carousel"}
              onClick={(event) => {
                event.stopPropagation();
                setIsPaused((previous) => !previous);
              }}
              className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/20 text-white/80 backdrop-blur-xl transition-all duration-300 hover:border-white/30 hover:bg-black/40 hover:text-white active:scale-90 sm:right-6 sm:top-6"
            >
              {isPaused ? (
                <Play size={13} fill="currentColor" />
              ) : (
                <Pause size={13} fill="currentColor" />
              )}
            </button>

            {/* HERO CONTENT */}

            <div className="absolute inset-x-0 bottom-0 z-20 p-5 sm:p-8 lg:p-11">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSlide._id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, ease: EASE_SMOOTH }}
                  className="max-w-[760px]"
                >
                  {/* TAG */}

                  <div className="mb-3 flex items-center gap-3">
                    <span className="h-[2px] w-7 rounded-full bg-brand-gold" />

                    <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-brand-gold">
                      {activeSlide.tag}
                    </span>
                  </div>

                  {/* TITLE */}

                  <h1 className="max-w-3xl text-[38px] font-black leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl md:text-6xl lg:text-[68px]">
                    {activeSlide.title}
                  </h1>

                  {/* SUBTITLE */}

                  <p className="mt-4 max-w-xl text-xs leading-6 text-white/65 sm:text-sm sm:leading-7">
                    {activeSlide.subtitle}
                  </p>

                  {/* CTA */}

                  <div className="mt-5 flex flex-wrap items-center gap-3 sm:mt-7">
                    <motion.button
                      type="button"
                      onClick={() => router.push("/productsPage")}
                      whileHover={{ ...buttonHover }}
                      whileTap={{ ...buttonTap }}
                      className={buttonStyles({
                        variant: "gold",
                        size: "lg",
                        className:
                          "group/cta uppercase tracking-[0.15em] shadow-lg shadow-black/20",
                      })}
                    >
                      Shop Collection
                      <ArrowRight
                        size={14}
                        className="transition-transform duration-300 group-hover/cta:translate-x-1"
                      />
                    </motion.button>

                    <button
                      type="button"
                      onClick={() => router.push("/productsPage")}
                      className="hidden items-center gap-2 rounded-xl border border-white/15 bg-surface/5 px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/70 backdrop-blur-md transition-all duration-300 hover:border-white/30 hover:bg-surface/10 hover:text-white sm:inline-flex"
                    >
                      Browse All
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* DESKTOP ARROWS */}

            {slides.length > 1 && (
              <div className="absolute bottom-7 right-6 z-30 hidden items-center gap-2 lg:flex">
                <button
                  type="button"
                  aria-label="Previous slide"
                  onClick={(event) => {
                    event.stopPropagation();
                    prev();
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/20 text-white/75 backdrop-blur-xl transition-all duration-300 hover:border-white/30 hover:bg-black/40 hover:text-white active:scale-90"
                >
                  <ChevronLeft size={18} />
                </button>

                <button
                  type="button"
                  aria-label="Next slide"
                  onClick={(event) => {
                    event.stopPropagation();
                    next();
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-gold text-white shadow-lg transition-colors duration-300 hover:bg-brand-gold-hover active:scale-90"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}

            {/* PROGRESS — isolated so its 20 Hz tick never re-renders the slides */}

            <CarouselProgress
              key={currentIndex}
              paused={isPaused || slides.length <= 1}
            />

            {/* MOBILE INDICATORS */}

            {slides.length > 1 && (
              <div className="absolute bottom-5 left-5 z-30 flex items-center gap-1.5 lg:hidden">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Go to slide ${index + 1}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      goToSlide(index);
                    }}
                    className={`h-1.5 rounded-full transition-all duration-500 ${index === currentIndex
                        ? "w-7 bg-brand-gold"
                        : "w-1.5 bg-surface/45"
                      }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ==================================================
              RIGHT SIDE PROMO CARDS
          ================================================== */}

          <div className="hidden min-h-0 gap-3 lg:flex lg:flex-col">
            {[secondarySlides[0], secondarySlides[1]]
              .filter(Boolean)
              .map((promo, index) => (
                <button
                  type="button"
                  key={promo._id}
                  onClick={() => router.push("/productsPage")}
                  className="group relative min-h-0 flex-1 overflow-hidden rounded-[24px] bg-[#171c24] text-left shadow-[0_14px_40px_rgba(23,28,36,0.12)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(23,28,36,0.18)]"
                >
                  {/* BACKGROUND */}

                  <Image
                    src={promo.image}
                    alt=""
                    fill
                    sizes="30vw"
                    className="scale-110 object-cover blur-[24px] opacity-40 transition-transform duration-700 group-hover:scale-125"
                  />

                  {/* MAIN IMAGE */}

                  <Image
                    src={promo.image}
                    alt={promo.title}
                    fill
                    sizes="30vw"
                    className="object-cover transition-transform duration-1000 group-hover:scale-105"
                  />

                  {/* OVERLAY */}

                  <div className="absolute inset-0 bg-gradient-to-t from-[#171c24]/90 via-[#171c24]/20 to-transparent" />

                  <div className="absolute inset-0 bg-gradient-to-r from-[#171c24]/35 to-transparent" />

                  {/* NUMBER */}

                  <div className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/20 text-[9px] font-bold text-white/70 backdrop-blur-xl">
                    0{index + 1}
                  </div>

                  {/* CONTENT */}

                  <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-gold/25 bg-brand-gold/10 backdrop-blur-md">
                        <Sparkles size={12} className="text-brand-gold" />
                      </span>

                      <span className="text-[8px] font-bold uppercase tracking-[0.25em] text-brand-gold">
                        {promo.tag}
                      </span>
                    </div>

                    <h2 className="max-w-[280px] text-xl font-black leading-tight tracking-tight text-white md:text-2xl">
                      {promo.title}
                    </h2>

                    <div className="mt-3 inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/55 transition-all duration-300 group-hover:gap-3 group-hover:text-white">
                      Explore
                      <ArrowRight size={12} />
                    </div>
                  </div>

                  {/* HOVER BORDER */}

                  <div className="pointer-events-none absolute inset-0 rounded-[24px] border border-white/0 transition-all duration-500 group-hover:border-brand-gold/50" />
                </button>
              ))}
          </div>
        </div>

        {/* ==================================================
            MOBILE PROMO CARDS
        ================================================== */}

        {secondarySlides.length > 0 && (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 scrollbar-none lg:hidden">
            {secondarySlides.slice(0, 3).map((promo) => (
              <button
                type="button"
                key={promo._id}
                onClick={() => router.push("/productsPage")}
                className="group relative min-w-[260px] flex-1 overflow-hidden rounded-[20px] bg-[#171c24] text-left"
              >
                <div className="relative h-[155px]">
                  <Image
                    src={promo.image}
                    alt={promo.title}
                    fill
                    sizes="280px"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-[#171c24]/90 via-transparent to-transparent" />

                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-brand-gold">
                      {promo.tag}
                    </span>

                    <h3 className="mt-1 text-sm font-bold text-white">
                      {promo.title}
                    </h3>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ==================================================
            MODERN SLIDE NAVIGATION
        ================================================== */}

        {slides.length > 1 && (
          <div className="mt-4 hidden items-center justify-between px-1 sm:flex">
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#8b929d]">
                Collection
              </span>

              <div className="h-px w-10 bg-[#e5e7eb]" />

              <span className="text-xs font-semibold text-brand-navy">
                {String(currentIndex + 1).padStart(2, "0")}
                <span className="mx-1 text-[#c8a84e]">/</span>
                {String(slides.length).padStart(2, "0")}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {slides.map((_, index) => (
                <button
                  type="button"
                  key={index}
                  onClick={() => goToSlide(index)}
                  aria-label={`Slide ${index + 1}`}
                  className={`h-1 rounded-full transition-all duration-500 ${index === currentIndex
                      ? "w-8 bg-brand-gold"
                      : "w-2 bg-[#d9dde2] hover:bg-[#aeb4bc]"
                    }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default Carousel;