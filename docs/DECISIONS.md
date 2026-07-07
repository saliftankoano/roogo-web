# Decisions

Why we made non-obvious calls — the reasoning, the trade-offs, and what we ruled
out. Newest first. For what shipped and when, see
[`CHANGELOG.md`](./CHANGELOG.md); for how things work, see
[`CONCEPTS.md`](./CONCEPTS.md).

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
