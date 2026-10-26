# Brand Showcase Studio & Pitch Records

White-label demo storefronts + internal sales records for the Jazari Tech
Official control plane. An operator prepares an industry-branded storefront
for a client pitch, previews it, publishes it to a public URL, and logs the
pitch — all without touching the real shared catalog.

---

## TL;DR

- **`/Admin/ShowcaseStudio`** — list, create, filter and manage brand showcase profiles.
- **`/Admin/ShowcaseStudio/[id]`** — the editor (Brand/SEO, Theme, Hero, Homepage sections, Contact/Footer, Publish).
- **`/Admin/ShowcaseStudio/[id]/preview`** — authenticated preview of the **draft**.
- **`/store/[slug]`** — the **public**, server-rendered branded storefront (published profiles only).
- **`/Admin/PitchRecords`** (+ `/[id]`) — internal pitch/sales records, admin-only.

Backend routes: `/api/v1/brand-profiles/*` and `/api/v1/pitch-records/*`
(mounted in `Backend/index.js`). Every admin route sits behind `verifyAdmin`;
pitch records have **no public route at all**.

---

## Architecture

```
Backend/
  utils/showcaseConfig.js        canonical validation + sanitization (single source of truth)
  Models/BrandProfile.js         draft + publishedConfig + version snapshots (lifecycle)
  Models/PitchRecord.js          internal sales record (admin-only fields)
  Controllers/brandProfileController.js
  Controllers/pitchRecordController.js
  Routes/brandProfileRoute.js
  Routes/pitchRecordRoute.js
  __tests__/showcaseConfig.test.js

Frontend/
  config/industryPresets.ts      static typed preset library (palettes, typography, section orders)
  app/utils/showcase.ts          shared types + localStorage slug persistence + public fetch
  app/Components/showcase/
    ShowcaseHome.tsx             pure presentational storefront renderer (shared by public + preview)
    ShowcaseProvider.tsx         client context: applies the active brand's CSS vars
    ShowcaseActivator.tsx        registers a slug as the active brand on /store/[slug]
  app/store/[slug]/page.tsx      public server-rendered storefront (ISR, 5-min freshness)
  app/Admin/ShowcaseStudio/*     list + editor + preview
  app/Admin/PitchRecords/*       list + detail
```

### Draft vs published — the core lifecycle

`BrandProfile` keeps **two** configurations:

- `config` — the editable **draft**. Saving only ever writes this.
- `publishedConfig` — an immutable snapshot created by an explicit **publish**.

Publishing records a version (`versions[]`, capped) and makes the published
copy live at `/store/[slug]`. The public endpoint **only** ever reads
`publishedConfig`; a draft or archived profile 404s publicly by construction.
Versions can be restored back into the draft at any time.

### Security contract

Everything that reaches MongoDB or a public response goes through
`sanitizeShowcaseConfig()` (`Backend/utils/showcaseConfig.js`):

- unknown keys are **dropped** (the client shape is never trusted),
- every colour is validated against the same strict hex regex the theme system uses,
- external URLs must be `http(s)` (`javascript:` / `data:` rejected); internal
  routes must start with a single `/` (no `//host` protocol-relative),
- Cloudinary-hosted URLs only for uploaded brand imagery,
- every string / array length is capped,
- referenced product/category ids are capped and **resolved against the real
  catalog** — a showcase can only *feature* real products, never create them.

`__tests__/showcaseConfig.test.js` guards the sanitizer and the preset-id /
section-type registries.

### Presets vs saved overrides

Presets (`config/industryPresets.ts`) are **static typed configuration** — no
seeding, no executable code, and they never create catalog records. Applying a
preset fills the profile's editable palette/typography; every value stays
manually editable, and preset values are **not** re-applied on load (saved
config wins).

> **ID contract:** preset ids in `industryPresets.ts` MUST stay in sync with
> `Backend/utils/showcaseConfig.js → INDUSTRY_PRESET_IDS`. The backend list is
> validated by the test suite; add a preset on both sides together.

### Catalog honesty

`featuredProducts` / `featuredCategories` sections store only product/category
**ids**. The storefront renderer receives them already resolved to real catalog
records by the backend (`resolvePublicConfig`). An empty selection renders a
polished empty state — never placeholder or fake inventory.

### Theme scoping

The public `/store/[slug]` injects the brand's colour tokens as an
`html:root` override block. The **admin preview** instead scopes the same CSS
variables to a wrapper element (CSS custom properties cascade to descendants),
so the surrounding Admin chrome keeps its own palette and a poor draft colour
choice can never make the preview screen unusable.

---

## Operator guide

1. **Create** a profile (name, client, industry preset, optional slug).
2. **Brand & SEO** — brand name, tagline, logo/favicon, meta title/description.
3. **Theme** — apply an industry preset, tune typography, adjust any colour token
   (per-token reset + reset-all available). Optionally use **AI brand direction**
   (requires `GEMINI_API_KEY`; returns an editable suggestion that is **never**
   auto-applied — the UI shows an honest "unavailable" state when unconfigured).
4. **Hero** — heading/subheading, primary/secondary CTAs, desktop + mobile imagery.
5. **Homepage** — add/reorder/hide/duplicate/remove sections; pick real products
   and categories per section.
6. **Contact & Footer** — details, social links, footer copy, powered-by flag,
   opt-in demo watermark.
7. **Preview** the draft at `/Admin/ShowcaseStudio/[id]/preview`.
8. **Publish** — saves the draft, snapshots a version, and serves it at
   `/store/[slug]`.

---

## Environment variables

Placeholder-only example files list **every** variable the code reads
(names only — never real values):

- `Backend/.env.example` — `MONGO`, `JWT`, `CLOUDINARY_*`, `FRONTEND_URL`,
  `SUPER_ADMIN_EMAIL` (+ `EMAIL`/`PASSWORD` SMTP for OTP emails) are required;
  everything else (`REDIS_URL`, `GEMINI_API_KEY`, `PUSHER_*`, `VAPID_*`,
  `ADMIN_EMAILS`, `RIDER_EMAILS`, model overrides, ops switches) is optional
  with graceful degradation. `GEMINI_API_KEY` is OPTIONAL — without it the AI
  suggest endpoints return `AI_NOT_CONFIGURED` and the manual workflow is
  unaffected.
- `Frontend/.env.example` — `NEXT_PUBLIC_API_URL` and
  `NEXT_PUBLIC_FRONTEND_URL` are required; `NEXT_PUBLIC_GOOGLE_*`,
  `NEXT_PUBLIC_ORS_API_KEY`, `NEXT_PUBLIC_ADSENSE_CLIENT_ID` and
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` are optional.

`FRONTEND_URL` on the backend matters for the Showcase Studio specifically:
after publish/archive/unarchive the backend calls
`POST <FRONTEND_URL>/api/showcase/revalidate` (with a short-lived,
showcase-scoped ticket) to purge the storefront's ISR cache on demand. If the
purge cannot run, the publish still succeeds and the response carries a
non-fatal `warnings` entry — the 5-minute ISR TTL remains the backstop.

---

## Pitch Records

Internal sales log: which demo was prepared for which client, which interfaces
were configured, which features were demonstrated, and the outcome. Statuses:
`draft → preparing → ready → presented → followup → won/lost`, plus `archived`.

- Linking a showcase profile **snapshots** its name/slug/preset, so the record
  stays readable even if the profile is later renamed or archived.
- `internalNotes` / `outcomeNotes` are returned **only** on authenticated admin
  endpoints — there is no public route.
- Deleting a record never touches its showcase profile.

---

## Verification

- **Backend:** `npm test` → 224/224 pass, 12 suites (incl. `showcaseConfig.test.js`).
- **Frontend:** `npx tsc --noEmit` clean.
- **Build:** `npm run build` succeeds; all new routes registered
  (`/Admin/ShowcaseStudio`, `/Admin/ShowcaseStudio/[id]`,
  `/Admin/ShowcaseStudio/[id]/preview`, `/Admin/PitchRecords`,
  `/Admin/PitchRecords/[id]`, `/store`, `/store/[slug]`).
- **Lint:** the new files are clean of `no-explicit-any`, `no-unused-vars` and
  `exhaustive-deps`. The only remaining hits are the repo-wide
  `react-hooks/set-state-in-effect` idiom (`setLoading(true)` inside an
  effect-invoked fetch), which every existing data-loading page also trips —
  it is the established codebase pattern, not a defect, and does not affect
  typecheck or runtime.
```
