# CLI Agent Task: Maps-Based Order Tracking + Live Rider Marketplace (InDrive/Bykea-style)

This is a large, security-sensitive feature. Work through the phases below IN ORDER.
Do NOT skip ahead, do NOT implement everything in one uninterrupted pass, and do NOT
touch any file, route, component, or business logic that isn't explicitly listed in
this prompt. After each phase, stop and report back before continuing to the next —
several decisions below require a human answer, not an assumption.

## Absolute scope boundary (read this first, and re-read it before every phase)

You are ONLY building: (1) map-based route/location display for admin + customers,
and (2) a new rider delivery-job marketplace. You must NOT modify:
- pricing, discounts, tax, or checkout/payment logic
- product, cart, stock/inventory logic
- existing authentication logic (only ADD to it if a new "rider" permission check is
  needed — do not restructure how auth already works)
- the existing order schema's unrelated fields — only ADD new fields needed for this
  feature, never rename/remove existing ones
- any UI/section outside of: the admin order-management screens, the customer
  order-tracking screen, and the (already-linked-but-seemingly-unbuilt) Rider
  Dashboard route referenced in Navbar.tsx (`role === "rider"` → `/rider`)

---

## PHASE 0 — Deep Audit (mandatory, do this before writing any code)

Before touching anything, investigate and report back on ALL of the following. Do not
guess or assume any of these — verify by reading the actual code/schema/config:

1. **Maps provider**: Is any map library already integrated anywhere in the codebase
   (Google Maps JS API, Mapbox GL, Leaflet, react-map-gl, etc.)? Check `package.json`
   and search the codebase for map-related imports. Report what's found, including
   any existing API keys/env vars already configured for a maps provider.
2. **Order model/schema**: Full current shape of the Order model/schema (backend),
   specifically: status field and its possible values (confirm whether "Shipped" is
   already a real status value), any existing address fields (customer address,
   coordinates if any), any existing shipping-price / shipping-fee field, and how
   order status updates currently happen (which admin endpoint/handler sets status).
3. **Rider role**: Confirm what already exists for the "rider" role — you already
   know `Navbar.tsx` links `role === "rider"` to `/rider`, so check: does that route
   exist at all yet? Is there a rider user model/flag? Any existing rider-specific
   backend endpoints or middleware for the "rider" role?
4. **Real-time infrastructure**: Confirm the existing socket/push setup — you know
   `PusherSocketProvider` (`useSocket`, `onNewNotification`/`offNewNotification`) and
   a web-push `notificationClient` (`subscribe()`) already exist. Document exactly
   how a new real-time event would be emitted from backend → specific connected
   clients (e.g., can the backend emit to "all users with role=rider", or only to a
   specific known user? This determines how job broadcast will work).
5. **Geolocation on the client**: Is there any existing use of the browser's
   Geolocation API (`navigator.geolocation`) anywhere (e.g. for delivery address
   auto-detection at checkout)? Report what's found.
6. **Existing notification sound handling**: Is there any existing audio/sound-effect
   pattern in the codebase (e.g. cart-added sound, order-placed sound)? Report what's
   found so a new sound is added consistently, not as a one-off hack.

**Do not proceed to Phase 1 until you've reported all six findings above.**

---

## PHASE 1 — Maps: Route Display for Admin + Customer Order Tracking

Scope: read-only map visualization first. No rider marketplace yet — this phase just
gets a route/location shown on a map in two places.

### 1a. Choose the maps approach (ask, don't assume)
Based on the Phase 0 audit: if a maps provider is ALREADY integrated, reuse it — do
not add a second competing maps library. If NONE exists yet, STOP and ask the human
which to use (Google Maps JS API is the most common choice for route + live-marker
use cases, but this requires an API key and billing setup on Google Cloud, which is a
business decision, not yours to make silently). Do not proceed to build the map UI
until this is confirmed.

### 1b. Admin panel — order route view
On the admin's order detail/management screen, add a map view showing:
- the store/warehouse origin point (this needs a fixed lat/lng — ask where this
  should be configured: hardcoded config value, or an admin settings field — don't
  invent a location)
- the customer's delivery address, geocoded to a lat/lng marker
- a drawn route line between the two points (using the chosen maps provider's
  directions/route API)
This is read-only for now — no rider marker yet (that comes in Phase 4/5).

### 1c. Customer order tracking page — same route view
On the customer's order tracking page, show the same origin → destination route for
their own order only (never expose other customers' addresses or orders). Before the
order is picked up by a rider, this is a static route preview ("your order will
travel this route"). Once live tracking is built (Phase 5), this same map will also
show the rider's live position.

### Explicitly forbidden in this phase
- No rider assignment logic yet.
- No changes to the order status flow yet.
- No changes to checkout/address-entry forms beyond what's needed to have a
  geocode-able address already stored (if the address format currently can't be
  geocoded reliably — e.g. free-text with no city/postal-code structure — report this
  as a blocker before proceeding, don't silently guess coordinates).

### Report back with
- Screenshot of the admin route view and the customer tracking route view.
- Confirmation of exactly which maps provider/API was used and where the API key is
  stored (env var name only — never paste the actual key value in the report).

---

## PHASE 2 — Data Model: Delivery Jobs & Rider Assignment (backend only)

Do NOT build any UI yet in this phase — backend/data model only.

### 2a. New "DeliveryJob" concept
When an admin updates an order's status to "Shipped", a corresponding delivery job
record should be created (or the Order itself gets new fields — pick whichever fits
the existing schema more naturally, and explain your choice). This record needs at
minimum:
- reference to the order
- pickup location (store/warehouse — same as Phase 1b)
- drop-off location (customer address, geocoded)
- the shipping price being offered to riders (see 2b — do not invent this number)
- status: e.g. `available` → `accepted` → `picked_up` → `delivered` (confirm/adjust
  naming against whatever status conventions already exist in the codebase)
- assigned rider reference (null until accepted)
- timestamps for each status transition (for the audit trail — this is a
  money-and-trust-sensitive feature, every transition must be traceable to who did it
  and when)

### 2b. Shipping price — ASK, do not invent
How is the shipping price riders see determined? Options to raise with the human
before building anything:
- a flat fee configured by the admin per order (manual entry when marking "Shipped")
- a fee calculated from distance (needs a formula — rate per km, base fee — none of
  which should be guessed)
- an existing "shipping fee" field that's already charged to the customer at checkout
  (if so, is the rider's payout the same number, a percentage of it, or a separate
  admin-set number?)
Do not pick one of these silently — this directly affects real money paid to riders
and must be confirmed.

### 2c. Concurrency-safe acceptance (critical — this is the "secure" part)
Multiple riders may see the same job and try to accept it at the same time. Design
and implement this as an atomic operation (e.g. a single conditional
update — "set assignedRider = X WHERE status = 'available'" — so only the first
successful write wins), NOT a read-then-write pattern that could race. Write a test
or at least a manual verification proving two near-simultaneous accept attempts on
the same job result in exactly one winner and the other gets a clean "already taken"
response — do not report this phase as done without that proof.

### 2d. Multi-order delivery support
A rider must be able to have more than one active accepted job at once (so they can
batch deliveries on one trip). Confirm there's no artificial "one active job per
rider" constraint baked in anywhere unless the human explicitly wants that limit —
ask if unsure.

### Report back with
- Final schema/model design actually implemented (fields + status enum).
- Confirmed shipping-price mechanism (from 2b) and who decided it.
- Proof of the concurrency test from 2c.

---

## PHASE 3 — Rider Dashboard (frontend)

Build the `/rider` route referenced in `Navbar.tsx` (currently just a nav link with
no confirmed destination page — verify in Phase 0 whether it already exists; if it
does, extend it, don't replace it wholesale).

### Required dashboard elements
- A list/map view of currently `available` delivery jobs (pickup location, drop-off
  area/distance, and the shipping price on offer) — respect location privacy: do not
  show the customer's exact address/phone number until AFTER a rider accepts the job;
  before acceptance, show a general area (e.g. neighborhood/city) only.
- An "Accept" action per job, calling the atomic-accept endpoint from Phase 2c, with
  clear UI feedback if the job was already taken by someone else.
- A view of the rider's own currently accepted/in-progress jobs (supporting multiple
  at once, per 2d), each with a way to advance status (e.g. "Picked Up" → "Delivered").
- Access control: this route and its API calls must verify `role === "rider"` (or
  admin/superadmin for oversight) server-side on every request — never trust a
  client-side role check alone, since this dashboard exposes real addresses and
  triggers real order status changes.

### Explicitly forbidden
- Do not let a rider mark an order "Delivered" without having first accepted it.
- Do not expose jobs belonging to a different rider's already-accepted order to
  anyone but that rider (and admin).

### Report back with
- Screenshot of the rider dashboard showing available jobs and in-progress jobs.
- Confirmation of the server-side role check on every rider endpoint (list the
  endpoints and where the check happens).

---

## PHASE 4 — Real-Time Job Broadcast + Sound Notification

Now wire Phase 2's job creation to real-time delivery, using the existing socket
infrastructure identified in Phase 0 (do not add a second, competing real-time
system — reuse Pusher/whatever is already there).

### Required behavior
- When an order's status is set to "Shipped" (and its delivery job becomes
  `available`), broadcast an event to all currently-connected users with
  `role === "rider"` (confirm from Phase 0 whether the existing socket setup can
  target "all riders" as a group, or whether this needs a new server-side broadcast
  mechanism — if the latter, build the minimal addition needed, don't over-engineer).
- On the rider dashboard, receiving this event should: (a) instantly add the new job
  to the available-jobs list without a manual refresh, and (b) play a short,
  attention-getting notification sound (InDrive/Bykea-style — a distinct "new job"
  tone) — reuse whatever existing sound-effect pattern was found in Phase 0, or if
  none exists, add one small audio asset + a play-on-event handler, consistent with
  how the rest of the app already triggers UI sounds/toasts.
- This must only fire for online riders currently on/near the dashboard — do not spam
  a push notification to every rider's phone for every single job unless that's an
  explicit requirement the human confirms (ask before adding push notifications on
  top of the in-app real-time event, since over-notifying riders will make them
  disable notifications entirely).

### Report back with
- Confirmation of exactly which existing real-time mechanism was reused.
- A recording/description proving: admin marks order "Shipped" → connected rider
  dashboard receives the job and plays the sound within a couple seconds, with no
  manual refresh needed.

---

## PHASE 5 — Live Location Tracking (rider → customer/admin map)

Only start this phase after Phases 1–4 are confirmed working.

### Required behavior
- Once a rider has accepted a job and marked it "Picked Up", their device should
  periodically send its current GPS coordinates (via `navigator.geolocation`,
  confirmed available/used or newly added per Phase 0 finding 5) to the backend,
  associated with that specific delivery job — at a reasonable interval (e.g. every
  10–15 seconds; do not hammer the server every second) and only while that job is
  actively in progress (stop sending once "Delivered").
- The customer's order tracking map (Phase 1c) and the admin's order route map
  (Phase 1b) should show the rider's live position updating on the route, for that
  order only.
- Location updates must only be visible to: the customer who owns that order, the
  assigned rider themselves, and admin/superadmin — never broadcast a rider's
  location to unrelated customers or other riders.

### Explicitly forbidden
- Do not track or store a rider's location when they have no active in-progress job.
- Do not expose a rider's raw location history beyond what's needed for the current
  active delivery — this is personal location data and must be handled narrowly.

### Report back with
- Screenshot/recording of a live position updating on both the customer tracking map
  and the admin map during a simulated in-progress delivery.
- Confirmation of exactly which users can access which location data, and where that
  access check is enforced (server-side, not just hidden in the UI).

---

## PHASE 6 — Final Security & Concurrency Review (before calling this done)

Before reporting the whole feature complete, explicitly verify and report on each of
these (this is the "secure feature" requirement from the original request — treat it
as a checklist, not a formality):

1. Every rider/admin endpoint touched in this feature re-checks role/ownership
   server-side on every request (list them).
2. The job-accept race condition (Phase 2c) is provably atomic.
3. Customer PII (exact address, phone) is withheld from riders until job acceptance.
4. Rider location data is scoped to active jobs only and only visible to the correct
   parties (Phase 5).
5. No existing endpoint, schema field, pricing calculation, or unrelated UI was
   altered anywhere outside what's described in this prompt — list every file
   touched across all phases, with a one-line description of the change, the same
   way the audit table was done in your previous motion-layer completion report.

### Final report must include
- The full files-touched table (file → what changed → confirmation nothing unrelated
  was touched).
- Answers/confirmations for all "ask, don't assume" points raised in Phases 1–4
  (maps provider choice, shipping-price mechanism, broadcast scope, push-notification
  decision).
- All screenshots/proofs requested in each phase, consolidated.