# Decisions

Why we made non-obvious calls — the reasoning, the trade-offs, and what we ruled
out. Newest first. For what shipped and when, see
[`CHANGELOG.md`](./CHANGELOG.md); for how things work, see
[`SYSTEM.md`](./SYSTEM.md).

---

### Hotels use Roogo as a booking and payment rail, not as a PMS — 2026-08-30

**Decision:** Roogo supports hotel discovery, room-type inventory, request-to-confirm
bookings, Mobile Money payment, front-desk verification, hotel payouts, and
government-event coordination. Hotel identity and permissions live in Supabase
memberships (`admin` or `staff`) while Clerk authenticates the person. A hotel pays
Roogo a 7% commission on completed reservations; the traveler sees the room price,
not an added platform fee. Events may add a negotiated room rate and pledged
inventory, but travelers still book and pay individually.

**Why:** The Department of Arts and Tourism opportunity requires thousands of
travelers to find participating hotels, stay within an allocated per diem, produce
payment evidence, and let coordinators see capacity. Hotels need demand,
reservation, payment, and reconciliation tooling from Roogo; they do not need Roogo
to replace housekeeping, walk-in, POS, channel-manager, or physical-room systems.
Reusing the daily-booking and wallet rails keeps the new market operationally
consistent with the rest of Roogo.

**Ruled out / alternatives:** A full property-management system was rejected as a
different product; instant booking was rejected because hotels must recheck live
availability; Clerk Organizations were rejected because bookings, roles, and
earnings already need one Supabase source of truth; blocked-date inventory was
rejected in favor of room-count availability; a central ministry payer was not
assumed because the agreed model is individual traveler payment.

**Status:** Settled and shipped across mobile
[PRs #11–#14](https://github.com/saliftankoano/roogo/pulls?q=is%3Apr+is%3Amerged+hotel)
and backend [PRs #19–#22](https://github.com/saliftankoano/roogo-web/pulls?q=is%3Apr+is%3Amerged+hotel).
See [how the hotel program works](./SYSTEM.md#how-does-the-roogo-hotel-program-work).

### Listing intent stays separate and controls sale/rental behavior — 2026-08-29

**Decision:** `listing_type` is the authoritative source for rental versus sale
intent everywhere on the web. The admin listings page exposes that intent with a
dedicated `Type d'annonce` filter. Expanded listing surfaces use it to choose
sale or rental price language and to suppress rental-only conditions and actions
for sales. Property shape (`maison`, `villa`, `terrain`, and similar values) and
audience category (`Residential` or `Business`) remain independent dimensions.
The admin API emits category from `property_type`, and expandable filter panels
expose dropdown overlays only after their height animation completes.

**Why:** Rental/sale intent disappeared when the page treated the remaining
property-type dropdown as if it covered every classification. At the same time,
the client overwrote every category as residential and an animated
`overflow-hidden` wrapper clipped otherwise-functional dropdown menus. A second
failure treated every non-daily listing as monthly, so a sale detail showed
`Prix du loyer`, `FCFA / mois`, caution, and advance rent even though its card
correctly said `À vendre`. Keeping intent explicit makes filters and pricing
predictable and keeps residual rental-shaped fields from changing sale meaning.

**Ruled out / alternatives:** Inferring rental versus sale from price suffixes or
`period` was rejected because display copy and legacy rental defaults are not
source data; clearing every residual rental field was not treated as the display
fix because old sale rows must still render safely; folding sale/rental into
property type was rejected because a villa can be either; raising dropdown
`z-index` alone was rejected because descendants cannot escape a clipping
ancestor.

**Status:** Settled and shipped in
[PR #16](https://github.com/saliftankoano/roogo-web/pull/16), with sale-detail
pricing enforcement verified on 2026-08-29. See
[how listing intent composes](./SYSTEM.md#how-do-listing-intent-and-admin-filters-compose).

### Mebo is a host-aware Roogo surface with gated advertiser onboarding — 2026-08-29

**Decision:** Roogo Mebo shares the Roogo Web deployment, accounts, and backend,
but host detection gives it its own shell, metadata, navigation, and onboarding
context. Production Mebo authentication uses Clerk satellite configuration.
Advertiser profile and proof APIs remain behind
`ADVERTISING_ONBOARDING_ENABLED`, with staff and founders allowed through for
controlled testing.

**Why:** Mebo needs a distinct advertising-marketplace identity without
duplicating authentication, deployment, or user records. A feature gate lets the
team validate business profiles, private evidence storage, and lifecycle rules
before exposing unfinished onboarding broadly.

**Ruled out / alternatives:** A separate application and account system was
rejected because it would duplicate identity and platform infrastructure;
showing the immobilier shell on the Mebo host was rejected because it confuses
the product promise; unrestricted public onboarding was rejected until the
operational review path is ready; direct staff writes to advertiser tables were
removed in favor of the same guarded APIs.

**Status:** Settled. The Mebo landing surface, host routing, profile/proof APIs,
and staff/founder test access shipped in
[PR #15](https://github.com/saliftankoano/roogo-web/pull/15); broad advertiser
onboarding remains controlled by the feature flag. See
[how Mebo shares the platform](./SYSTEM.md#how-does-mebo-share-roogo-web-without-becoming-the-immobilier-site).

### Staff may bootstrap a missing ownership dossier only for the real seller's sale — 2026-08-29

**Decision:** On an owner-linked sale whose ownership status is `unsubmitted` or
`rejected`, staff and founders may create or reuse one pending ownership dossier
for that property and seller, then add private evidence to it. The dossier cannot
be approved while empty, and creating it does not add files to the public listing
gallery or make the staff member the owner.

**Why:** Sellers such as older or offline customers may hand documents directly
to Roogo without ever completing the mobile submission step. Requiring a
seller-created dossier left staff with nowhere safe to put legitimate evidence;
bootstrapping the same canonical review object preserves the ownership chain and
one auditable decision.

**Ruled out / alternatives:** Uploading the document as a listing image was
rejected because ownership evidence is private; assigning the sale to the staff
member was rejected because operational help is not ownership; approving an
empty placeholder dossier was rejected because a status alone is not evidence.

**Status:** Settled and shipped in
[PR #14](https://github.com/saliftankoano/roogo-web/pull/14). This extends the
earlier staff-upload decision below; see
[how staff adds ownership evidence](./SYSTEM.md#how-does-staff-add-ownership-evidence-to-a-review).

### Motion explains state changes instead of decorating the interface — 2026-08-29

**Decision:** Roogo uses one restrained motion grammar across public, account,
onboarding, and staff pages: a short route fade, a continuous active-navigation
indicator, small press feedback, and limited evidence-forming motion. Navigation
bars remain spatially stable, ambient loops stay exceptional, and both Framer
Motion and CSS animations honor the user's reduced-motion preference.

**Why:** Competing springs, hover lifts, blur-and-zoom entrances, disappearing
navigation, and repeated ambient loops made the interface feel less predictable.
Stable landmarks and a shared timing curve make state changes easier to follow
without slowing down frequent staff work.

**Ruled out / alternatives:** Page-specific animation passes were rejected
because they would drift; GSAP was not added because the existing Framer Motion
stack already covers route, layout, and interaction feedback; removing all
motion was rejected because navigation and state changes still benefit from a
brief orientation signal.

**Status:** Settled and shipped in
[PR #15](https://github.com/saliftankoano/roogo-web/pull/15). The follow-up audit
also covered discovery, property detail, account,
careers, contact, onboarding, payment, and 3D-visit surfaces. See [how the motion
system works](./SYSTEM.md#how-does-motion-work-across-roogo-web). A second exhaustive
pass included all staff routes, blog/tutorial/legal/auth routes through the root
provider, Mebo, Tailwind transform utilities, validation motion, and shared UI.
The baseline is now executable through `npm run motion:audit` and runs before every
production build, preventing future routes or components from silently drifting.

### Tutorials live in the public Blog, not behind onboarding — 2026-08-28

**Decision:** Roogo's educational guides use canonical `/blog/<slug>` URLs, with
Tutoriels as the first Blog category. Articles, category pages, videos, and
structured data come from shared content records; legacy `/tutoriels` URLs
redirect permanently. Blog routes remain public and bypass profile-completion and
acquisition-source gates.

**Why:** Owners need help before and during signup and listing creation. Hiding
instructions behind the workflow they explain defeats that purpose, while a
single Blog structure can grow beyond tutorials without creating competing
content systems or duplicate SEO pages.

**Ruled out / alternatives:** Keeping a standalone tutorial microsite was
rejected because it fragments discovery and metadata; duplicating article
implementations under both URL families was rejected because content and
analytics would drift; requiring completed onboarding was rejected because
prospective and blocked users are a primary audience for help.

**Status:** Settled and shipped in
[PR #13](https://github.com/saliftankoano/roogo-web/pull/13).

### Staff-added ownership evidence stays on the pending seller submission — 2026-08-19

**Decision:** Staff and founders can append PDF or image evidence to an existing
pending ownership submission. Images are normalized before upload, every file
stays in the private `ownership-documents` bucket, and staff-added entries carry
their source and uploader metadata in the submission's document array. Reviewed
submissions remain immutable through this flow.

**Why:** Owners frequently hand documents to the Roogo team outside the app, but
the review screen previously only displayed files the owner uploaded. Keeping
staff additions on the same pending submission preserves one decision record and
lets reviewers compare all evidence before approving or rejecting the listing.

**Ruled out / alternatives:** A second staff-only submission was rejected because
it would split one ownership decision across competing records; the public
listing-photo bucket was rejected because ownership evidence is private; arbitrary
office-file uploads were rejected in favor of the formats reviewers can reliably
open and inspect: PDF, JPEG, PNG, and WebP.

**Status:** Settled and shipped 2026-08-19. See
[how the review upload works](./SYSTEM.md#how-does-staff-add-ownership-evidence-to-a-review).

### Hard-deleted listings are recreated selectively, never recovered by rolling production backward — 2026-08-11

**Decision:** When a deleted listing predates every retained backup, recreate
only that listing as private and pending under the verified owner. Staff must
review the recovered facts, upload the original photos again, and then resume
the normal workflow. Never restore the whole production database merely to
recover one property.

**Why:** Roogo's hard-delete path cascades through property records and queues
its `listing/{propertyId}` Storage prefix for deletion. Supabase's seven-day
scheduled backups cannot recover a row deleted before their retention window,
Point-in-Time Recovery was not enabled, and database backups do not contain
deleted Storage objects. A full rollback would also discard every legitimate
change made after the chosen snapshot.

**Ruled out / alternatives:** Restoring the oldest available production backup
was rejected because the listing was already absent from it; reusing another
property's surviving photos was rejected because Storage ownership is
property-specific; publishing the reconstruction immediately was rejected
because staff must confirm the recovered data and photos first.

**Status:** Settled. The Rimkieta monthly rental was recreated in production as
`en_attente` under its verified owner on 2026-08-11. See
[how deleted-listing recovery works](./SYSTEM.md#how-do-we-recover-a-hard-deleted-property-listing).

### Offline leases become audited Roogo relationships, not retroactive platform payments — 2026-08-07

**Decision:** Staff and founders may import an already-signed monthly lease
between an existing owner, property, and renter. The import creates a real
active agreement, locks the listing, records the signed document and covered
months, and generates future schedules. Money collected before the import is
labelled `offline_import` and never creates a PawaPay transaction, owner earning,
withdrawable balance, or Roogo-issued payment receipt.

**Why:** Owners and renters already transact offline but still need Roogo for
future rent tracking and payments. Representing the relationship as a normal
active agreement lets both accounts continue inside the product, while a
separate immutable audit record preserves the financial truth about what Roogo
did and did not process.

**Ruled out / alternatives:** A global owner-to-renter link was rejected because
tenancy is property-specific; marking old cash as an ordinary Roogo payment was
rejected because it would corrupt payout balances and receipts; owner
self-service linking was excluded from v1 because staff must verify the signed
lease and financial history.

**Status:** Settled and shipped 2026-08-07 in commit `0bce88f`. See
[how offline lease imports work](./SYSTEM.md#how-does-an-existing-offline-lease-enter-roogo).

### Staff navigation groups work by task instead of exposing every destination — 2026-08-06

**Decision:** Staff and founders keep `Annonces` as the primary direct action,
while related destinations are grouped under `Messages`, `Opérations`,
`Développement`, and `Pilotage`. Founder-only finance and settings remain
permission-gated inside `Pilotage`.

**Why:** The flat navigation exposed too many equally weighted choices and made
routine property work harder to scan. Task-oriented groups preserve access
without presenting the entire back office as one long menu.

**Ruled out / alternatives:** Removing low-frequency destinations entirely was
rejected because staff still needs them; role-specific duplicate navigation
implementations were rejected because they would drift.

**Status:** Settled and shipped in PR #8.

### Direct sale intake is provisional contact data, not provisional ownership — 2026-08-06

**Decision:** Staff may prepare a sale for an owner who has no Roogo account by
recording private contact details in a one-to-one `sale_intakes` record and
leaving `properties.agent_id` empty. A staff member must later select an actual
owner or agent account; one atomic operation links the listing and creates the
seller conversation. Until then, documents, mandates, and publication remain
blocked. Every public sale presents Roogo as the contact and omits seller
identity, regardless of who originally created it.

**Why:** Some owners contact Roogo directly and cannot complete the digital
listing flow themselves. Staff needs to prepare their property without
misrepresenting Ablassé or another staff member as its owner. Manual,
single-use linking preserves a clear chain of ownership and the existing signed
mandate protection.

**Ruled out / alternatives:** Fake owner accounts and temporary staff ownership
were rejected because they corrupt authorship and mandate history; automatic
phone-number matching was rejected because a match is not proof of ownership;
reassignment after linking was excluded from v1 because it could move an active
dossier or mandate to the wrong account.

**Status:** Settled and shipped in PR #7. See
[how direct sale intake works](./SYSTEM.md#how-does-a-direct-sale-intake-become-an-owner-linked-listing).

### City stays an id in the DB; labels applied at display/slug level — 2026-07-23

**Decision:** `properties.city` keeps storing the picker id (`"ouaga"`) that both
apps filter on; translation to "Ouagadougou" happens only in `getCityLabel`
(slugs, meta descriptions, location strings). Quartier free text is normalized
at write time (whitespace, ALL-CAPS to title case) but never reshaped further.
Slugs were regenerated ONCE (migration 057) to absorb these fixes while they
were hours old and unindexed; the immutability rule from the entry below holds
from now on.

**Why:** Rewriting city values in the DB would break every filter and form
default keyed on the id across web and mobile. Mapping at the edge fixes the
user-visible problem with zero migration risk.

**Ruled out:** storing display names in a new column (duplication that will
drift); constraining quartier to a picker (the free field is how owners express
real micro-locations like "Karpala quatre yaar").

**Status:** Settled.

### Property URLs are ID-free SEO slugs, immutable after creation — 2026-07-23

**Decision:** Public property pages move from `/proprietes/<uuid>` to a stored
descriptive slug (`/proprietes/villa-3-chambres-a-louer-ouaga-2000-ouagadougou`),
column `properties.slug` (migration 056), generated once at listing creation and
never regenerated. Legacy uuid URLs permanently redirect (308) to the slug URL,
so nothing shared or indexed before the change breaks. Meta descriptions are now
composed from real listing data (type, chambres, quartier, prix, owner text)
instead of the generic display description.

**Why:** Listing pages are our highest-intent SEO surface; random uuids waste
the URL signal for queries like "villa à louer Ouaga 2000". Immutability keeps
every shared link alive even if the owner later edits quartier or type — the
uuid stays the internal key, the slug is only an address.

**Ruled out:** (a) Zillow-style slug + visible id in the URL (works without a DB
column, but Salif wanted fully clean URLs); (b) regenerating slugs on edit with
a redirect-history table (permanence complexity for marginal freshness).

**Status:** Settled. Would reopen only if slug collisions or renamed quartiers
become a real problem at scale.

### Roogo Sell economics v2: base commission + 50/50 surplus split — 2026-07-09

**Decision (direction agreed, details open):** Replace the pure two-price-spread
model with a transparent commission model, inspired by how démarcheurs already
work in Ouagadougou (the "reçu" settlement ritual):

- The listing keeps the SELLER'S desired price `D` ("on maintient le prix
  désiré par le vendeur").
- Roogo's commission has two parts: a base percentage of `D` (10% in the field
  anecdote; final rate TBD), plus 50% of any surplus when the final sale price
  `P` exceeds `D`.
- Seller nets `D × (1 − base%) + (P − D) / 2`. Worked example from the team
  discussion: parcelle desired at 3M, sold at 10M with a 10% base → Roogo gets
  300k + 3.5M = 3.8M; the seller walks away with 6.2M instead of 3M.
- The same structure applies to individual owners AND real-estate agencies.
- The commission must be made explicit to sellers up front ("what we want to
  make clear is that we'll be taking a percentage of the sale").

**Why:** The spread model hides Roogo's take and gives the seller zero upside,
which reads as the exact trick informal middlemen pull (sell at 10M, hand the
owner his 3M, pocket 7M silently). Splitting the upside 50/50 aligns
incentives: the seller WANTS Roogo to negotiate hard, and the disclosed base
percentage buys trust. It also matches the settlement culture buyers/sellers
already know (receipts on the table, split the surplus, everyone shakes hands).

**Ruled out / alternatives:**
- *Pure spread (status quo, migrations 039–043)* — rejected by the team as
  "pas rentable / ça nous arrange pas" and opaque to sellers.
- *Keeping 100% of the surplus* — that's the démarcheur move the model
  deliberately breaks with.

**Status:** Settled 2026-07-09, shipped as migration 050 + full-stack v2. The six
open points were resolved: (1) base % fixed at 10% but modular — a founder-editable
platform setting on `listing_config` (like the rent commission), read live by web
and mobile, snapshotted per mandate at send time; (2) staff/founders list at
whatever price they establish and adjust it freely; everything above the desired
price is surplus, and the seller is never shown or notified of the listing price;
(3) the notary works from the owner's desired amount for now, stored as a
switchable setting `sale_notary_price_basis` (`desired`|`list`); (4) no minimum
fee (the adjustable 10% suffices); (5) pre-050 signed mandates are test data,
ignored beyond non-crashing legacy card rendering; (6) disclosure appears BOTH in
the "Vendre avec Roogo" step before listing and itemized on the mandate card the
owner signs (percentage plus concrete FCFA amounts). How it works:
[SYSTEM](./SYSTEM.md#how-does-roogo-sell-the-broker-model-work). Settlement
tooling (recording the real sale price and computing the final split) is the next
block; `sale_notary_price_basis` is stored now and consumed then.

---

### Update delivery policy: OTA for JS, native builds when needed — 2026-07-09

**Decision:** JS-and-assets-only changes ship via OTA (`eas update`, production
channel) without touching any version field. Native changes (modules, plugins,
permissions, SDK) ship as store builds following
`roogo/docs/PRODUCTION_BUILD_CHECKLIST.md`, bumping `version` and
`runtimeVersion` together. Because a runtime bump cuts old binaries off from
all future OTAs silently, the app now checks our own `/api/app-version`
endpoint and shows an update banner; the endpoint is bumped only once a
release is actually live in each store (checklist step 9), never at
submission.

**Why:** Two field reports in one day exposed the gap: updates were said to
eject sessions (telemetry now measures it: `app_updated` with
`session_survived`), and Salif saw iOS never announce an available update.
Store auto-update is unreliable and OTA by definition cannot reach a binary on
an older runtime, so without our own prompt a runtime bump quietly freezes
part of the user base on the old version forever.

**Ruled out / alternatives:**
- *Querying the stores directly from the app* (iTunes lookup / Play scraping)
  — rejected: no reliable Play API, and store propagation lags would prompt
  users toward pages still serving the old binary. Our endpoint is bumped by a
  human when the release is confirmed live.
- *Bumping runtimeVersion on every release regardless* — rejected: it would
  needlessly cut OTA reach; JS-only releases keep the runtime.

**Status:** Settled. Note: the banner and telemetry were committed after the
1.17.0 binaries were built, so they reach 1.17.0 users via the first OTA
published to the 1.17.0 runtime once the store release is live.

---

### Sale chat surfaces anchor on the property, not people — 2026-07-09

**Decision:** Every sale conversation is visually identified by the property's
cover photo (marketplace-app pattern): inbox rows, the thread header, and the
admin console rows. The cover is resolved exactly like the public feed does
(`property_images` row with `is_primary`, else the first photo, public
`listing`-bucket URL), collapsed server-side into a single `property.cover_url`
on both conversation payloads. When a property has no photos, the fallback is a
neutral house-icon placeholder — never a user avatar and never the Roogo logo.
The Roogo team identity stays where it means something: on the in-thread
message bubbles.

**Why:** Roogo Sell threads are per-property, so two conversations with the
same counterpart about different properties looked identical in the inbox. The
property is the real subject of the thread; a face (or our logo) answers "who"
when the user is asking "which one". A wrong identity is worse than a
placeholder, hence the hard no-avatar-fallback rule.

**Ruled out / alternatives:**
- *Falling back to the other party's avatar* — rejected; it re-introduces the
  ambiguity the change removes and leaks person-identity into a
  brand-mediated chat.
- *Keeping the Roogo logo in the thread header* — rejected; the header names
  the subject (the property), bubbles carry the team identity.
- *Resolving covers client-side* — rejected; the join + collapse lives once in
  the API (`withPropertyCover`), so mobile and admin cannot drift.

**Status:** Settled. Shipped 2026-07-09 across mobile inbox, mobile thread
header, and /admin/sale-chat.

---

### Sale chat documents ride the attachment pipe, allowlisted — 2026-07-09

**Decision:** Documents (PDF, doc/docx, xls/xlsx, ppt/pptx, txt, csv) are
ordinary `text` sale messages with one attachment, reusing the exact signed-URL
transport images and voice notes use. The mime allowlist is enforced
server-side when the signed upload URL is created (an unlisted type never gets
a URL), the client caps size at 20 MB (documents are not compressed, unlike
images), and the original filename is stored in a new
`sale_message_attachments.file_name` column (migration 048) so bubbles show
"Titre foncier.pdf" instead of a UUID.

**Why:** Land titles, plans, mandates and receipts already circulate as PDFs
and office files in Burkina deals; forcing photos of documents loses fidelity.
Reusing the attachment pipe means no new bucket, no new message type, and old
clients simply ignore the new field. Server-side allowlisting matters because
a signed URL would otherwise accept any bytes (APK/executable risk in a chat
users trust).

**Ruled out / alternatives:**
- *A new `document` message_type* — rejected; `mime_type` on the attachment
  already discriminates rendering, and migration 047's CHECK list stays small.
- *Accepting arbitrary file types* — rejected (malware surface, unopenable
  files on low-end Androids).
- *Compressing/converting documents server-side* — rejected; unlike photos,
  document bytes are the artifact. The 20 MB cap bounds the data cost instead.

**Status:** Settled. Shipped 2026-07-09; requires migration 048 (filenames are
display-only until it runs, sending works regardless).

---

### Sale chat speaks as one Roogo + voice notes planned — 2026-07-09

**Decision:** In seller-facing chat, the team is a single brand identity: Roogo
logo avatar, "Équipe Roogo" label, no individual staff names. Internally (staff
mobile view + admin console) every message shows exactly who on the team wrote
it. The name gating happens server-side: the API only includes `sender_name`
when the requester resolves to staff/founder, so an owner's payload never
carries it. Any staff member can join and reply to any conversation (no
assignment lock). The thread gets a WhatsApp-style wallpaper (faint real-estate
doodles on brand sand).

**Why:** Owners should feel they're talking to Roogo, not to a rotating cast of
individuals; that keeps trust in the brand and lets any teammate pick up any
thread without the owner noticing a handoff. Internally, accountability needs
the opposite: per-message attribution.

**Ruled out / alternatives:**
- *Client-side hiding of names* — rejected; privacy must survive a curious
  client, so the field is never emitted to owners.
- *Per-staff avatars for owners* — rejected; individual identities invite
  side-channel contact and make handoffs visible.

**Status:** Fully shipped 2026-07-09: identity, wallpaper, voice notes (record,
mandatory playback preview, AAC mono 32 kbps, 2-minute cap, `message_type:
'voice'` via migration 047), and the always-dark chat surface. Voice rationale:
a large share of Burkinabè owners can't comfortably read or write; WhatsApp has
already trained the gesture, and a 60-second note at that bitrate is smaller
than one listing photo. Dark rationale: on a near-black surface the wallpaper's
contrast is structural (bubbles are the only bright objects), which is why
WhatsApp's doodle pattern works; tuning a light pattern against light bubbles
kept failing. The chat is always dark regardless of system theme: it is a
distinct place, and one theme means one set of legibility guarantees.

---

### Conditional listing form for sales & bare land — 2026-07-08

**Decision:** The listing wizard adapts to what's being listed. Sales (vendre) hide
all tenant-relationship sections (refundable deposit, move-in "Total à l'entrée"
math, interdictions, house rules) and show only physical-asset amenities (jardin,
piscine, solaires, securite — wifi and meuble read as rental perks). Bare land
(terrain, whether for rent or sale) drops the bedroom/bathroom/vehicle counters
entirely — 0 is now legal end-to-end (backend stores null) — and superficie
becomes required, since m² is the headline fact of a land deal.

**Why:** The old form was rental-shaped for everything: a land sale literally could
not be submitted honestly (bedrooms/bathrooms were forced ≥ 1 in the UI, the mobile
schema, AND the server schema), and sales showed nonsense like a move-in total
computed from the asking price. Real seller feedback surfaced both.

**Ruled out / alternatives:**
- *Conditioning the counters on listing_type instead of property type* — rejected;
  a terrain rental has the same problem. A follow-up review (2026-07-08) generalized
  the terrain `if` into a per-type capability map (`LISTING_TYPE_CAPABILITIES`):
  `commercial` premises are also rooms-exempt (a shop has no bedrooms) but keep the
  vehicles counter (parking matters) and don't require superficie.
- *Clearing stale rental values on type-switch* — rejected in favor of stripping
  them at payload build, which also survives restored drafts.
- *One schema-level superRefine* — not possible as-is: both repos `pick()`/`omit()`
  the base schema, so the rule lives in a shared plain function
  (`requireListingFieldsByType`) mirrored mobile/web with identical messages.

**Status:** Settled. The API also force-empties interdictions/house rules on sales
so pre-update app builds can't write tenant rules onto sale listings.

---

### Support console goes mobile + read receipts — 2026-07-06

**Decision:** Staff/founders answer support chats from a **Support** segment inside the
mobile Messages tab (alongside **Ventes**), not a separate screen. Added read receipts
(✓/✓✓ "Lu") to **both** support and sale chat. No DB migration — reused the existing
`read_at` column and `unread_for_*` counters.

**Why:** The founder had a real user waiting and could only reply from the website —
there was no mobile interface listing conversations. The Messages tab is where a founder
already looks for conversations, so a segment there is the most discoverable home.
Read receipts were nearly free because sale chat already stamped `read_at`; sharing the
indicator across both surfaces keeps them consistent.

**Ruled out / alternatives:**
- *Separate "Support client" screen off the Profile menu* — less discoverable; the
  Messages tab is the natural conversation hub.
- *New API routes for the mobile console* — unnecessary. The root cause of "can't reply
  on mobile" was that the existing `/api/support/admin/*` routes weren't in middleware
  `isPublicRoute`, so mobile Bearer calls were rejected. One middleware line fixed it
  (routes still gate on `isStaffLikeUserType` in-handler). See
  [how](./SYSTEM.md#how-is-the-mobile-app-authorized-to-hit-our-api-and-supabase).
- *Per-screen Supabase token registration* — a code review caught that each chat hook
  registered the one process-global Supabase token getter and nulled it on unmount, so
  closing one chat screen de-authenticated any other still-mounted one. Moved to a single
  registration at app root.

**Status:** Settled (shipped in app 1.16.0/61). Open follow-up: confirm the live "Lu"
flip actually arrives over Realtime; if it only updates on refocus, `sale_messages` /
`support_messages` need `REPLICA IDENTITY FULL`.

---

### Visites 3D move under the Roogo brand — 2026-07-06

**Decision:** The 3D virtual-tour scanning service (marketing page + self-serve
booking + PawaPay payment + SMS) moved from the Kazedra site to `/visites-3d` here.
Kazedra is now purely a software-development/consulting brand and 308-redirects its
old `/visites-3d` URL to us. Pricing simplified to a **single 15 000 FCFA / pièce**
rate — the old dual pricing (10 000 standalone / 7 500 "with Roogo", 25% off) is
retired along with the `with_roogo` column.

**Why:** 3D visits for homes and businesses are squarely part of Roogo's real-estate
mission; keeping them on the agency site split the brand story. The "discount if you
list on Roogo" framing also made no sense once Roogo itself is the seller. Both
sites already shared one Supabase project, so the `bookings` table and its data were
already in our database — the migration was code + branding, not data.

**Ruled out / alternatives:**
- *Marketing page only (booking via WhatsApp)* — rejected; the self-serve flow
  already worked and was worth keeping end-to-end.
- *Separate PawaPay webhook endpoint* — rejected; deposit IDs are UUIDs with unique
  indexes in both `transactions` and `bookings`, so the existing
  `/api/pawapay/callback` can route safely by lookup fallback (`lib/visit3d-callback.ts`).
- *Keeping two price tiers as a listing incentive* — rejected in favor of one simple
  number.

**Status:** Shipped. Ops follow-ups: apply migration `045` (drops `with_roogo`),
point the PawaPay dashboard webhook at `roogobf.com`, then strip the
Supabase/PawaPay/AT env vars from kazedra's Vercel. SMS (`AT_*`/`TEAM_PHONE` in
Vercel) is deliberately skipped for now — the integration isn't in use; bookings
work without it and failures are logged, not thrown. See [visites-3d.md](./visites-3d.md).

---

### Identity (KYC) becomes optional — 2026-07-06

**Decision:** Owner/agent identity verification (photo of national ID, recto/verso)
is no longer a gate on posting a listing. It's now an optional recommendation,
surfaced as a dismissible nudge in the add-property wizard, and rewarded with the
"identité vérifiée" trust badge. Applies to **both** rentals and sales.

**Why:** Owners in Burkina Faso were reluctant to post because handing over their ID
upfront — before even seeing the listing form — reads as a risk given how much
fraud ("arnaque") there's been locally. The hard gate was killing conversion (team
feedback from Cosmos). The real safety nets don't depend on upfront KYC: staff
moderate every listing before it goes live (`en_attente` → `en_ligne`), and sales
keep their own stronger gates.

**Ruled out / alternatives:**
- *Relaxing it for sales only* — rejected; the reluctance applies to all owners, and
  the gate wasn't branched by listing type anyway.
- *Removing verification entirely* — rejected; verified owners still earn the trust
  badge, so the flow stays as a voluntary path (also reachable from the profile
  screen).
- *Also relaxing the sale ownership/mandate gates* — rejected; those protect buyers
  and are core to the broker model (see below). Identity ≠ ownership.

**Status:** Settled. Would reopen if fraud from unverified posters becomes a problem
that staff moderation can't absorb.

---

### Roogo Sell = broker model, not marketplace — 2026-07-06

**Decision:** Roogo's property-selling feature is a broker/mandate/consignment
model, not a buyer↔seller marketplace. Roogo is the only counterparty in every
conversation: sellers talk only to Roogo, buyers talk only to Roogo, each in a
per-property thread. The seller names a **net price** they want; Roogo sets a higher
**public sale price** and keeps the spread. An in-app **signed mandate** locks the
prices + an exclusivity period before Roogo publishes. Visits and a final **notary
meeting at the Roogo office** are Roogo-run; background checks, signing, and payment
happen offline at the office.

**Why:** Operating direct buyer↔seller communication proved too hard to manage.
Making Roogo the principal intermediary on both sides is controllable and matches how
these transactions actually close locally (in person, at a notary, with cash-scale
amounts where online payment is too costly).

**Ruled out / alternatives:**
- *10% commission* — replaced by the two-price spread; simpler to communicate and
  aligns Roogo's incentive with getting a good sale price.
- *Buyer↔seller chat with a consent gate* — removed entirely; there's no stranger to
  warn about when Roogo is the only counterparty.
- *Online payment* — rejected at these amounts; too costly. Payment is offline at the
  office.

**Status:** Settled (v1 shipped). Open thread: whether staff need a dedicated agenda
screen for upcoming visits/notary meetings (currently chat cards + notifications
only). See [how it works](./SYSTEM.md#how-does-roogo-sell-the-broker-model-work).
