# CHANGELOG — audit-driven hardening pass

All changes are **"how it runs", never "what it does"**. No business logic,
workflow, feature behaviour, API contract, response shape or user-visible output
was intentionally changed. Verification results are recorded at the bottom.

---

## GROUP 1 — Dead code & cleanup

Every target was re-verified with a full-tree reference search before removal
(including `.js`/`.mjs`/config files, not just `src`).

### Deleted (confirmed unreferenced)
| Path | Why |
|---|---|
| `Frontend/src/app/utils/theme.js` | No import anywhere; a second, stale copy of brand colours (superseded by `dynamicTheme.ts` + `globals.css`). |
| `Frontend/src/app/utils/designTokens.ts` | Zero references in `src/`. |
| `Frontend/src/app/Components/MotionPrimitives.tsx` | Zero references. |
| `Frontend/src/app/Components/AdminStatCard.tsx` | Zero references. |
| `Frontend/nul` | Stray 0-byte Windows redirect artifact. |
| `Backend/api/` | Empty directory (no files). |
| `Backend/jobs/` | Empty directory (no files). |
| `Backend/queues/` | Empty directory (no files). |

`ErrorBoundary.tsx` was **not** deleted — it was unused and has now been mounted (Group 3).

---

## GROUP 2 — Duplication consolidation

### 2.1 Shared currency formatter
- **NEW** `Frontend/src/app/utils/format.ts` — `formatPKR(value)`.
  Output is character-for-character identical to the previous inline
  `Rs ${value.toLocaleString()}` (including the `null`/`undefined` case, which
  matches the old optional-chained `Rs undefined` output).
- **NEW** `Frontend/scripts/_fmt_codemod.mjs` (temporary, **deleted after run**) —
  a reviewed codemod that migrated **92 inline occurrences across 39 files**.
  It intentionally only matched self-contained receivers (identifier /
  optional-chained member chain / fully-parenthesised expression / single call
  expression), so no operator precedence could change.
- Files migrated (each: replaced inline `Rs …toLocaleString()` with `formatPKR(…)`
  and added the shared import):
  `Admin/Carts/page.tsx`, `Admin/Categories/page.tsx`, `Admin/Orders/page.tsx`,
  `Admin/Products/page.tsx`, `Admin/Referrals/page.tsx`,
  `Admin/components/AnalyticsCharts.tsx`, `cart/page.tsx`, `checkout/page.tsx`,
  `not-found.tsx`, `product/[id]/page.tsx`, `productsPage/page.tsx`,
  `profile/orders/page.tsx`, `profile/orders/[orderId]/page.tsx`,
  `Components/AIProductChat.tsx`, `Components/CartDrawer.tsx`,
  `Components/CategoryProductRow.tsx`, `Components/FreeShippingProgressBar.tsx`,
  `Components/OrderTrackingWidget.tsx`, `Components/ProductSpotlight.tsx`,
  `Components/RecentlyViewed.tsx`, `Components/RelatedProducts.tsx`,
  `Components/checkout/CheckoutItemCard.tsx`,
  `Components/checkout/ConfirmationModal.tsx`,
  `Components/navbar/DesktopSearch.tsx`, `Components/order/ChangeLocationModal.tsx`,
  `Components/product-card/VariantA.tsx`, `VariantB.tsx`, `VariantC.tsx`,
  `Components/rider/JobCard.tsx`, `Components/ui/StepIndicator.tsx`,
  `utils/referral.ts`.
- Post-verification: `grep` confirms the only remaining inline occurrence is
  inside `format.ts` itself; no `Rs Rs` / double-prefix produced; `tsc` clean.

### 2.2 Single canonical `baseUrl`
- **NEW** `Frontend/src/app/utils/apiBase.ts` — server-safe `baseUrl`
  (module WITHOUT `"use client"`, so server files can import it).
- `Frontend/src/app/utils/commonFunctions.tsx` — now imports `baseUrl` for its own
  use and **re-exports** it (and `formatPKR`) so every existing import keeps
  working unchanged.
- Redeclarations replaced:
  `page.tsx`, `utils/dynamicThemeServer.ts`, `api/theme/revalidate/route.ts`,
  `ai-search/page.tsx`, `Components/AIProductChat.tsx`, `utils/notificationClient.ts`.
  The two with trailing-slash normalisation keep `.replace(/\/?$/, "/")` applied
  to the shared value (identical behaviour).
- **Intentionally left untouched:** `Frontend/src/app/sitemap.ts` — its constant is
  **not** a redeclaration; it has a *different* fallback
  (`https://irhasinnbackend.vercel.app/api/v1` vs `http://localhost:5000/api/v1/`),
  so consolidating it would change behaviour when `NEXT_PUBLIC_API_URL` is unset.

### 2.3 ProductCard handler extraction
- `Frontend/src/app/Components/ProductCard.tsx` — extracted the duplicated
  auth/localStorage cart branch shared by `handleAddToCart` and `handleBuyNow`
  into one `addProductToCart()` helper. Callers keep their exact order and
  behaviour: Add-to-Cart = mutate → toast → dispatch; Buy-Now = mutate → dispatch
  → `router.push("/checkout")`.

### 2.4 SKIPPED (needs your decision — see final report)
- Consolidating `product-card/VariantA|B|C` and `navbar/VariantA|B|C` shared
  markup into presentational primitives. This is a real markup refactor whose
  "exact rendered output unchanged" guarantee cannot be proven here without a
  visual-snapshot harness; there is none in the repo. **Not attempted.**

---

## GROUP 3 — Bug fixes

### 3.1 `getMyOrders` bound
- `Backend/Controllers/orderController.js` — the legacy (no-pagination) branch now
  caps the query at `LEGACY_MAX_ORDERS = 100` while returning the **same array
  shape**. Both in-app consumers already pass `page`/`limit`
  (`OrderTrackingWidget` `limit=10`, `profile/orders` `limit=50`), so their
  results are unchanged; the cap only prevents an unbounded read for a caller
  that omits pagination.

### 3.2 Error boundaries
- **NEW** `Frontend/src/app/error.tsx` — route-segment fallback (logs via
  `console.error`, offers Try Again / Go Home).
- **NEW** `Frontend/src/app/global-error.tsx` — root-layout fallback.
- `Frontend/src/app/ClientLayout.tsx` — now mounts the previously-unused
  `ErrorBoundary` around `{children}` and logs the failed `auth/me` hydration
  (previously a silent `.catch`). Success paths untouched.

### 3.3 Silent-catch visibility
- **NEW** `Frontend/scripts/_catch_codemod.mjs` (temporary, **deleted after run**).
- `Frontend/src/app/Components/ProductCard.tsx`, `Frontend/src/app/ClientLayout.tsx`
  — hand-edited to `console.error` their previously silent failures.
- Codemod converted **26 empty catch blocks across 10 files** into
  `catch (err) { console.error("[silent-catch <file>]", err); }`:
  `Admin/Chats/page.tsx`, `Admin/Products/page.tsx`, `Admin/Users/page.tsx`,
  `chat/page.tsx`, `checkout/page.tsx`, `Components/AppLoader.tsx`,
  `Components/Navbar.tsx`, `Components/RecentlyViewed.tsx`,
  `profile/notifications/page.tsx`, `rider/layout.tsx`.
- The one intentional no-op
  (`ProductForm.tsx:181` "already revoked — safe to ignore") was deliberately
  left alone.
- Note: `next.config.ts` strips `console.log/debug/info` in production but keeps
  `console.error`, so these are visible in production logs.

### 3.4 ESLint config alignment
- `Frontend/package.json` + `Frontend/package-lock.json` — `eslint-config-next`
  bumped `15.5.2` → `^16.2.9` (installed 16.3.6) to match `next` 16.x.
- `Frontend/eslint.config.mjs` — migrated from `FlatCompat.extends(...)` (which
  v16 no longer supports and which threw `Converting circular structure to JSON`)
  to the native flat config: `eslint-config-next/core-web-vitals` +
  `eslint-config-next/typescript`. **Lint-config-only change.**
- `eslint --fix` was run; its only auto-fixes were `prefer-const` in
  `not-found.tsx` (kept, alongside the format change) and `useGeminiAI.ts` (kept).
  Two files where `--fix` removed intentional `eslint-disable` comments
  (`Admin/BulkUpload/page.tsx`, `Components/OrderLiveTracking.tsx`) were
  **reverted** to avoid silently re-enabling suppressed rules.

---

## GROUP 4 — Performance (no logic change)

### 4.1 Lazy-load dormant variants
- `Frontend/src/app/Components/ProductCard.tsx` — `VariantB`/`VariantC` now
  `next/dynamic` (code-split). `VariantA` stays a static import; it is the only
  arrangement any call site requests, so the rendered path is unchanged.
- `Frontend/src/app/Components/Navbar.tsx` — same treatment for
  `NavbarVariantB`/`NavbarVariantC`.

### 4.2 Shared Redis cache for analytics
- `Backend/Controllers/analyticsController.js` — the 5-minute analytics summary
  is now written to / read from the shared Redis cache-aside layer
  (`utils/redisCache.js`, key `analytics:summary:<days>`, TTL 300s) in addition to
  the existing per-instance memory cache. `?refresh=true` clears both. Payload is
  byte-identical; when Redis is unavailable it falls back to the previous
  behaviour exactly (`safeGet` returns `null`).

### 4.3 SKIPPED (see final report)
- **React.memo on heavy-page leaves** — not applied: the heaviest pages define
  their leaves inline and pass per-render callbacks, so memoising them would add
  overhead without benefit and would require component extraction (output-change
  risk). No viable leaf target identified without behavioural risk.
- **Migrating remaining direct `axios` calls to `useFetch`** — not applied: it
  would change error/loading UX and caching semantics (a behaviour change), which
  the brief forbids.

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` (Frontend) | ✅ clean |
| `npm run build` (Frontend) | ✅ succeeds; all routes still `Revalidate 5m` (ISR preserved); `/api/theme/revalidate` still dynamic |
| Backend Jest (`node --experimental-vm-modules …/jest.js --forceExit`) | ✅ **11 suites / 207 tests passed** |
| `node --check` on modified backend files | ✅ |
| `npm run lint` (Frontend) | ✅ runs (config fixed); 696 problems remain — overwhelmingly pre-existing `no-explicit-any`/unused-var findings, not introduced here |
| Currency output | ✅ 92/92 sites migrated; only `format.ts` retains the canonical pattern; no double prefix |
| Generated `Frontend/public/sw.js` | reverted (build artifact churn) |

---

## Follow-up — Ambient hero accents were effectively invisible

Reported symptom: the decorative `AnimatedBackgroundAccents` layer on the
homepage hero did not appear to animate at all.

### Diagnosis (each listed cause checked, with evidence)

1. **Rendered?** Yes. `<AnimatedBackgroundAccents />` is mounted
   unconditionally in `Carousel.tsx` (line 428) in the *with-slides* hero, as
   the first child of the hero stacking context. It is only absent in the
   `loading` and `slides.length === 0` early-return branches (unchanged).
2. **CSS in the built bundle?** Yes, and it is linked by the homepage. The
   `.ir-ambient-*` rules and `@keyframes ir-ambient-breathe` survive in
   `.next/static/css/<hash>.css`, the `--color-brand-*` custom properties are
   emitted, and `.next/server/app/index.html` links that exact chunk. Tailwind
   does **not** strip them.
3. **Opacity / layering? Cuplrit found here.** Layering is correct
   (`z-index: 1`, above the opaque slide image, below the `z-10` scrims) —
   verified by hit-testing in a headless render. But the *amplitude* was far too
   low: with all four fields pinned at their `0.18` peak, the maximum per-channel
   pixel change over the hero was only **14/255 (≈5%)**, mean 1.20/255, i.e.
   below the perceptual threshold. Two of the four fields also use
   `--color-brand-navy` / `--color-brand-navy-soft`, which are near-identical to
   the hero's dark navy, so they contributed almost nothing.
4. **`prefers-reduced-motion`?** Not falsely triggered (verified: animation
   runs, computed opacity is mid-cycle, not the frozen branch). But the frozen
   fallback was itself `opacity: 0.08` — also effectively invisible.
5. **Position/size/clipping?** Fine — shapes are non-zero, inside the hero,
   only lightly clipped by the hero's `overflow: hidden`.
6. **Stale bundle / PWA?** The committed `public/sw.js` is a stale build
   artifact (it references a CSS chunk hash that no longer exists), so a stale
   service worker can serve old CSS. This is a deployment artifact, not a source
   bug; see the verification note below.
7. **Excluded from the bundle?** No — the PWA `exclude` rules only drop
   `/Admin/` chunks and `.wasm`/`.mjs`; nothing here is dropped.

**Root cause:** the layer renders, animates and stacks correctly, but its peak
contrast was calibrated below the visible threshold — `0.18` opacity, spread by
`blur(48px)`, sitting under two dark gradient scrims, with two fields in a
navy-on-navy colour that can never show.

### Fix (CSS only — `Frontend/src/app/globals.css`)

| Before | After | Why |
|---|---|---|
| breathe peak `opacity: 0.18` | `0.45` | clears the perceptual threshold while staying a soft glow |
| `filter: blur(48px)` | `blur(28px)` | stops the colour being spread too thin |
| keyframe travel `-14px / scale(1.06)` | `-18px / scale(1.08)` | slightly more evident motion |
| cycle `19 / 23 / 27 / 21s` | `16 / 19 / 22 / 18s` | motion is evident within a few seconds, still slow |
| reduced-motion static `opacity: 0.08` | `0.2` | the frozen state is now visible too |

No component, markup, colour token, layout, or JS was touched — only the
`.ir-ambient-*` block. `pointer-events: none`, `aria-hidden`, GPU-only
`opacity`/`transform` and the reduced-motion freeze are all preserved.

### Verified (headless render + pixel diff, same scene, accents on vs off)

| Metric | Before | After |
|---|---|---|
| max channel delta | 14/255 | **30/255** |
| mean channel delta | 1.20/255 | **2.36/255** |
| pixels changed by >2 levels | 126,331 | **349,321** |

`npx tsc --noEmit` clean; `npm run build` succeeds with all routes still
`Revalidate 5m`; lint unchanged (444 errors, 253 warnings — pre-existing).
Backend untouched, so no backend re-run was required.

---

## Follow-up — ambient accents promoted to a single GLOBAL layer

The hero-only layer was refactored into one site-wide component mounted at the
root layout.

### Sources of truth
| File | Role |
|---|---|
| `Frontend/src/app/Components/AnimatedBackgroundAccents.tsx` | The only renderer; Server Component, pure CSS, zero JS |
| `Frontend/src/app/globals.css` | `.ir-ambient-*` rules, `@keyframes ir-ambient-breathe`, and the transparent-shell rules |
| `Frontend/src/app/layout.tsx` | The single mount point (first visual child of `<body>`) |

No second copy exists. The redundant instance and its import were removed from
`Components/Carousel.tsx`, so the layer can never paint twice.

### The blocker and the decision
Every route painted an opaque full-viewport background (homepage
`main.bg-surface`, other routes `main/div.bg-surface-page`, admin
`div.min-h-screen.bg-[#F7F8FA]`, rider `…bg-[#F8FAFC]`). A fixed layer at
`z-index: -1` would therefore have been hidden on every page. Per the chosen
option, the layer now **paints the base surface itself** and the full-page
shells hand their background over to it. Only elements carrying BOTH a surface
colour utility and a full-height utility are matched, so cards, inputs, panels
and skeletons keep their own background exactly as before.

### Layering / a11y / perf
- `position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none`
  + `aria-hidden="true"` — strictly behind all content, headers, modals and
  dropdowns; never affects layout, CLS or scrollbars.
- Animation touches only `opacity` + `transform`; `filter: blur(26px)`;
  peak opacity `0.38` (within the calibrated 0.35–0.45 band).
- Shapes moved to the four corners so central content stays clean.
- Fully theme-driven: `--color-brand-gold`, `--color-brand-navy-soft`,
  `--color-brand-gold-strong`, `--color-brand-gold-hover`,
  `--color-surface-page`. **No hardcoded hex.**
- The fourth field now uses a warm mid-gold instead of `--color-brand-navy`, so
  it can never render navy-on-navy (invisible over a dark base).
- Reduced motion: `animation: none !important` with a static `opacity: 0.18`
  (still clearly visible).

### Verified (headless render, pixel-diffed against a flat control)
| Environment | Max Δ | Mean Δ | Text contrast |
|---|---|---|---|
| Light storefront base `#F7F8FA` | 96/255 | 8.2 | 14.8:1 (preserved) |
| Dark base `#171c24` | 149/255 | 6.5 | 15.6:1 (preserved) |
| `prefers-reduced-motion: reduce` (frozen) | 82/255 | 3.5 | 14.8:1 |

Computed-style probe: `position=fixed`, `inset=0`, `z-index=-1`,
`pointer-events=none`, base `rgb(247,248,250)`, page shell
`rgba(0,0,0,0)`, no horizontal overflow. The ambient markup is present in the
prerendered HTML of every inspected route (`/`, `/cart`, `/checkout`, `/Admin`).

`tsc` clean, build succeeds (ISR `Revalidate 5m` intact), lint unchanged.

### Known limitation (accepted with the chosen option)
The homepage is a stack of opaque full-width sections (`bg-surface`,
`bg-surface-muted`, …), so the layer is largely hidden there. Dark chrome
(Navbar, Footer, Admin sidebar) is likewise opaque and covers it. Extending
transparency to those section backgrounds was offered as the higher-risk option
and not taken.

---

## Follow-up — homepage bleed-through + geometric "box" redesign

### A. Homepage now shows the layer (opaque section backgrounds → near-opaque alpha)
The homepage's full-width sections each painted a fully opaque surface, which
covered the fixed `z-index: -1` layer on `/` alone. Each such section's own
surface utility was converted to the equivalent alpha (~28% transparent) using
Tailwind's existing opacity modifier syntax — no new CSS, no markup structure,
no layout/content/spacing change:

| File | Class before → after |
|---|---|
| `Components/Carousel.tsx` (loading + main hero) | `bg-surface` → `bg-surface/72` |
| `Components/Categories.tsx` | `bg-surface` → `bg-surface/72` |
| `Components/Products.tsx` (error + main) | `bg-surface` → `bg-surface/72` |
| `Components/PromoBanner.tsx` | `bg-surface` → `bg-surface/72` |
| `Components/ProductSpotlight.tsx` | `bg-white` → `bg-white/72`; `bg-surface-page` → `bg-surface-page/72` |
| `Components/HomeSections.tsx` | `bg-surface` → `bg-surface/72`; `bg-[#F8FAFA]` → `bg-[#F8FAFA]/72` |
| `Components/CategoryProductRow.tsx` | `bg-white` → `bg-white/72` |
| `Components/LookingForSomething.tsx` | `bg-surface-page` → `bg-surface-page/72` |
| `Components/About.tsx` | `bg-surface` → `bg-surface/72` |
| `Components/Contact.tsx` | `bg-surface` → `bg-surface/72` |
| `page.tsx` (brand trust strip) | `bg-surface-muted` → `bg-surface-muted/72` |

Inner cards, panels, inputs, skeletons and the image-backed dark brand banner
were deliberately left fully opaque — only the top-level full-width section
surfaces changed. `layout.tsx` still mounts exactly one
`AnimatedBackgroundAccents`; no per-section ambient copies were added.

### B. Blobs → four distinct rounded-rectangle "boxes"
`globals.css` `.ir-ambient-shape*` rewritten:
- `border-radius` rounded **rectangles** (not circles), each with its own size,
aspect ratio, radius and tilt: shape-1 `36%×44%` `-9°`, shape-2 `24%×58%` `7°`
(navy), shape-3 `44%×30%` `11°`, shape-4 `22%×46%` `-13°`.
- `filter: blur(15px)` (was `26px`) so the silhouette stays faintly legible;
a 1px low-opacity gold edge is added for definition.
- Animation is still `@keyframes ir-ambient-breathe` on
`opacity`/`transform`/`rotate` only (GPU-composited). Each shape carries its own
`--ir-peak` (0.14–0.18) so the cool navy box stays softer than the warm golds.
- Colours remain theme-variable only (`--color-brand-*`, `--color-surface-page`) —
**no hardcoded hex**. `pointer-events:none` and `aria-hidden="true"` unchanged.
- `prefers-reduced-motion: reduce` still freezes the layer, now at each shape's
full `--ir-peak` so the frozen state stays clearly visible.

### Verification (headless Chrome, `--force-prefers-reduced-motion`, 1280×900)
Pixel-diffed against a **clean rebuild of the pre-change source** (the first
comparison run used a stale pre-existing `.next` and was discarded):

| Check | Result |
|---|---|
| `/` mid-section solid colour (white & trust strip) | Δ ≤ 1–2 / 255 — visually identical |
| `/` bottom-left corner | `[251,247,247]` → `[247,241,237]` (ambient now bleeds) |
| `/` bottom-right corner | `[249,243,234]` → `[245,238,227]` |
| `/checkout` whole-frame (ambient redesign only) | max 29/255, mean 2.43 — no layout shift |
| `/cart`, one `/Admin` page | render correctly; only the ambient shapes differ |

A stale-artifact false positive (a 221/255 delta in the navbar) was traced to
the pre-existing `.next` build, not this change: rebuilding the pre-change
source reproduced it, while the new build differs from that rebuild by ≤ 29/255.

`npx tsc --noEmit` clean; `npm run build` succeeds with the homepage and all
other routes still `Revalidate 5m` (ISR untouched); lint unchanged (444 errors,
253 warnings — all pre-existing, none in a touched file).

### Files touched
`Frontend/src/app/globals.css`,
`Frontend/src/app/Components/AnimatedBackgroundAccents.tsx` (comment only),
`Carousel.tsx`, `Categories.tsx`, `Products.tsx`, `PromoBanner.tsx`,
`ProductSpotlight.tsx`, `HomeSections.tsx`, `CategoryProductRow.tsx`,
`LookingForSomething.tsx`, `About.tsx`, `Contact.tsx`,
`Frontend/src/app/page.tsx`.

## Follow-up — ambient layer evolved into an animated ROW × COLUMN architectural grid

The four isolated rounded boxes were redesigned into an asymmetric,
continuously animated **architectural grid** — "living architecture" behind
the storefront — while preserving everything from the previous ambient work
(single mount in `layout.tsx`, `/72` section translucency, theme-variable
colours, zero JS, reduced-motion support).

### Design implemented

- **Grid:** 4 unequal columns (`1.05fr 1.55fr 1fr 1.2fr`) × 4 unequal rows
  (`1.3fr 0.85fr 1.2fr 0.95fr`) with `gap: clamp(6px, 1vw, 18px)` and a
  `-5% / -4%` bleed clipped by the fixed `overflow: hidden` container.
  **9 rounded-rect fill panels** placed selectively (4 gold, 2 navy, 2
  near-neutral, 1 micro-red) — 7 of the 16 slots are deliberately EMPTY so
  the composition never reads as a table or checkerboard.
- **Hierarchy:** one large gold column (anchor), one small gold cell, one
  large gold centre panel (gold hairline + soft glow), one gold corner cell;
  a wide navy top panel + a navy block; two crisp near-neutral structural
  panels; the single red micro-accent (1 of 16 slots — well under the ≤10%
  red budget). Gold + navy + white + neutrals remain dominant.
- **Lines:** 4 hairline seams on row/column boundaries (one gold, one
  deliberately only 46% wide) that shimmer between 4–6% and 12–18% opacity —
  discovered, not announced.
- **Shining:** one gold highlight sweep (`ir-grid-sweep`, 16s cycle ≈ 9s
  travel + 7s rest, blur 26px) for the occasional premium light pass.
- **Colour discipline:** every ambient colour is a theme variable or a
  `color-mix()` over one — no hardcoded hex in the layer. Added the additive
  `@theme` token `--color-brand-accent: #C14444` for the micro-accent.
- **Animation (pure CSS, transform/opacity/static `rotate` only):**
  `ir-grid-drift` (3 major panels, 16–20s), `ir-grid-breathe` (6 secondary
  panels, 13–26s), `ir-grid-shimmer` (lines, 16–24s), `ir-grid-sweep`;
  negative delays stagger every element; opacity breathes between 50–100% of
  peak so the architecture never blanks out. **No setInterval/rAF/React
  state — the component stays a Server Component with 16 DOM nodes.**
- **Responsive (adapt, don't scale):** `≤1023px` → `--ir-k: 0.8` /
  `--ir-m: 0.7`; `≤639px` → `--ir-k: 0.62` / `--ir-m: 0.45` plus 3 cells and
  2 lines hidden (6 visible panels on mobile). No `100vw`, no negative
  margins, no `overflow-x` patches.
- **Reduced motion:** animations off; every panel held at its designed peak
  with its tilt intact, lines at shimmer-high, sweep removed → a complete,
  static, intentional composition.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean (exit 0) |
| `npm run build` | exit 0; `/` ISR preserved (`initialRevalidateSeconds: 300`, expire `1y`); 40 prerendered routes intact |
| `npm run lint` | **697 problems (444 errors / 253 warnings) = exact pre-change baseline**; the touched component lints clean |
| Horizontal overflow 1440 / 768 / 390 | `scrollWidth == clientWidth` at every scroll position |
| Horizontal overflow 1024 | 1027 vs 1024 — **pre-existing navbar overflow**: hiding the ambient layer leaves it byte-identical (ambient contributes 0), culprit is `hidden md:flex shrink-0 …` nav content at `right: 1029.28` |
| Click interception | `elementFromPoint` never returns an ambient node (5 probes × 4 viewports) |
| Stacking / a11y | `position: fixed`, `z-index: -1`, `pointer-events: none`, `aria-hidden="true"` — all confirmed in the live DOM |
| DOM budget | 16 decorative nodes (root + 15); 9 cells / 4 lines / 1 sweep |
| Reduced motion | 0 running animations, panels frozen at peak (min opacity 0.085), two frozen captures byte-identical (deterministic) |
| Grid contribution (frozen A/B pixel diff) | desktop hero mean 1.96 / max 12; desktop mid mean 3.02 / max 12; desktop bottom mean 2.24 / max 38; mobile hero mean 0.61 / max 8; mobile bottom 0 (opaque footer) |
| Composition of the worst case | max 38 occurs only in a 71px inter-section gap where the raw background is exposed; 79.5% of pixels unchanged, 0.013% ≥ 30 — panel reads as a soft `rgb(227,228,229)` block, not a glare |
| Tuning pass | first measurement exposed too-strong gold glows → box-shadow alpha 70%/75% → 35%/40%, neutral borders 12%/10% → 9%/8% (peak Δ 40 → 38) |

### Files touched
- `Frontend/src/app/Components/AnimatedBackgroundAccents.tsx` — markup (4 spans → grid + 9 cells + 4 lines + sweep) and doc comment; still a Server Component.
- `Frontend/src/app/globals.css` — additive `--color-brand-accent` token; the `.ir-ambient-*` block rewritten as the grid system (cells, lines, sweep, 4 keyframes, responsive rules, reduced-motion block).
- `CHANGELOG.md` — this section.

No business logic, section, `/72` translucency, ISR, PWA or dependency
changed; the single mount in `layout.tsx` is untouched.
