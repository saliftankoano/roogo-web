# Decisions

Why we made non-obvious calls — the reasoning, the trade-offs, and what we ruled
out. Newest first. For what shipped and when, see
[`CHANGELOG.md`](./CHANGELOG.md); for how things work, see
[`CONCEPTS.md`](./CONCEPTS.md).

---

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

**Status:** Open. Settles when these are decided: (1) the base % value and
whether staff can vary it per mandate / per seller type (owner vs agency,
terrain vs house); (2) whether the public listing price is exactly `D` or
staff may still list above it (and if so, whether that spread counts as
surplus); (3) how the final sale price `P` is evidenced (notary act) for the
surplus calculation; (4) a minimum fee for low-value parcelles; (5) treatment
of mandates already signed under the spread model; (6) where the disclosure
appears (listing wizard, mandate card, both). Implementation will touch
`property_mandates` (new columns), the mandate send/sign flows, the mandate
card copy on mobile + `/admin/sale-chat`, and the "Vendre avec Roogo" copy.

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
  [how](./CONCEPTS.md#how-is-the-mobile-app-authorized-to-hit-our-api-and-supabase).
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
only). See [how it works](./CONCEPTS.md#how-does-roogo-sell-the-broker-model-work).
