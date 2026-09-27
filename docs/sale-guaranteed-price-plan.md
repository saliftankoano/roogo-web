# Roogo Sell v3: guaranteed seller price (implementation plan)

Status: **implemented on branch, not deployed** (2026-09-27, branch
`feat/sale-v3-guaranteed-price` in roogo-web and roogo; not merged; migration 075
written, not executed). Business decision: Obsidian vault
`08 Decisions/2026-09-27 Roogo Sell guaranteed seller price.md`.

Open questions answered by Salif (2026-09-27): round displayed/published ladder
prices to the nearest 50,000 FCFA (exact values stored); the seller does not see the
exact listing price in the mandate; existing v2 mandates stay on v2.

Where the implementation differs from this plan (reasons in
[DECISIONS](./DECISIONS.md#roogo-sell-v3-guarantees-the-sellers-net-price--2026-09-27)):
- Ladder and fee percentages are in a new service-role-only `sale_economics_config`
  table, not `listing_config` (publicly readable). Only `sale_bypass_fee_pct` and
  `sale_bypass_months` are on `listing_config`.
- Mandates also snapshot `target_markup_pct` and `team_floor_markup_pct`.
- Signing does not write `properties.seller_asking_price` (public via
  `public_property_details`).
- Displayed floors round up to 50,000 FCFA; listing and target round to nearest.
- `sale_closings` also snapshots the percentages, stores `bypass_fee`, referrer
  flags/labels and `sold_at`; uniqueness is one non-cancelled closing per property.
- Staff tools read the ladder from a new staff-only `GET /api/admin/sales/config`.

## What changes for the business

| | v2 (today, migration 050) | v3 (this plan) |
| --- | --- | --- |
| Seller receives | Desired price minus 10%, plus 50% of any surplus | **Exactly the desired price (net), guaranteed** |
| Roogo earns | 10% of desired price + 50% of surplus | **Sale price − net price − notary − referral fees** |
| Notary | Not modeled | **2% of final sale price**, paid from the margin |
| Referrers | Not modeled for sales | **2% (brought the buyer), 1% (referred the seller)** of final price, from the margin |
| Public price | Staff set freely, seller not told | Staff list at **+30%**; target +20%; team may accept ≥ +15%; **+15% to +10% needs Salif's approval; below +10% refused** |
| Bypass | Not covered | If sold within **12 months** to a buyer Roogo introduced, Roogo is owed **10% of the sale price** |
| Exclusivity | 90 days default | Unchanged (90 days default) |

Worked example (net 35M): sold at 42M with a middleman bringing the buyer →
notary 0.84M, buyer referrer 0.84M, seller 35M, Roogo 5.32M.

## Current code that encodes v2 (all must change)

Web (`roogo-web`)
- `lib/sale.ts`: `MANDATE_TERMS_VERSION = "2026-07-v2"`, header comment.
- `lib/sale-mandate.ts`: `getSaleCommissionConfig`, `sendMandate` (snapshots base/surplus pct, posts `mandate_offer` metadata), `signMandate` (publishes `properties.price = desired_price`, posts `mandate_signed`).
- `supabase/migrations/050_sale_commission_model.sql`: `listing_config.sale_base_commission_percentage`, `sale_surplus_split_percentage`, `sale_notary_price_basis`; `property_mandates.desired_price`, `base_commission_pct`, `surplus_split_pct`.
- `app/api/pricing/route.ts` and `app/api/admin/pricing/route.ts`: expose the v2 percentages.
- `app/admin/parametres/page.tsx`: edits the v2 percentages.
- `app/admin/sale-chat/page.tsx`: mandate form preview (lines ~620–630) and mandate card (lines ~849–857) show "Commission Roogo : 10% = …".

Mobile (`roogo`)
- `constants/sale.ts`: mirror of `MANDATE_TERMS_VERSION` and comment.
- `app/sale-chat/[id].tsx`: mandate offer/signed cards (lines ~803–860) render base commission and surplus.
- `app/(tabs)/add-property.tsx`: "Sale commission consent (10%)" gate at listing creation (line ~158) and the sale info modal text.

Not present today: **any sale closing record** (final price, buyer, fees, payouts). v3 needs one, and sale referrals will depend on it.

## Plan

### 1. Database: migration `075_sale_guaranteed_price.sql`

1. `listing_config` (founder-editable, snapshotted onto each mandate):
   - `sale_listing_markup_pct NUMERIC NOT NULL DEFAULT 0.30`
   - `sale_target_markup_pct NUMERIC NOT NULL DEFAULT 0.20`
   - `sale_team_floor_markup_pct NUMERIC NOT NULL DEFAULT 0.15`
   - `sale_hard_floor_markup_pct NUMERIC NOT NULL DEFAULT 0.10`
   - `sale_notary_fee_pct NUMERIC NOT NULL DEFAULT 0.02`
   - `sale_buyer_referral_pct NUMERIC NOT NULL DEFAULT 0.02`
   - `sale_seller_referral_pct NUMERIC NOT NULL DEFAULT 0.01`
   - `sale_bypass_fee_pct NUMERIC NOT NULL DEFAULT 0.10`
   - `sale_bypass_months INTEGER NOT NULL DEFAULT 12`
   - CHECK constraints: all pct in [0, 1]; hard floor ≤ team floor ≤ target ≤ listing markup.
   - Keep the v2 columns (history); stop reading them for new mandates.
2. `property_mandates`:
   - `economics_version TEXT NOT NULL DEFAULT 'v2'` (existing rows stay v2; v3 rows set `'v3'`).
   - Reuse `seller_net_price` for the guaranteed net (it already means "what the owner walks away with"); keep `desired_price` null on v3 rows, or set both and document which is authoritative. **Decision: v3 writes `seller_net_price`; `desired_price` stays v2-only.**
   - Snapshot columns: `listing_markup_pct`, `hard_floor_markup_pct`, `notary_fee_pct`, `buyer_referral_pct`, `seller_referral_pct`, `bypass_fee_pct`, `bypass_months`.
   - CHECK: v3 rows require `seller_net_price` and all snapshots non-null.
3. New `sale_closings` (one per sold property):
   - `property_id` (unique), `mandate_id`, `buyer_user_id` (nullable), `buyer_name`, `buyer_phone`
   - `final_price NUMERIC NOT NULL`, `seller_net_price NUMERIC NOT NULL` (copied from mandate)
   - `notary_fee`, `buyer_referral_fee`, `seller_referral_fee` (NUMERIC, computed server-side, stored)
   - `roogo_margin NUMERIC NOT NULL`
   - `below_team_floor BOOLEAN`, `approved_by UUID` (Salif's approval when below team floor), `approved_at`
   - `notary_signed_at`, `roogo_paid_at`, `status` in (`draft`, `approved`, `notarized`, `settled`, `cancelled`)
   - `is_bypass BOOLEAN DEFAULT false` (sale concluded outside Roogo to an introduced buyer; fee = bypass pct)
   - CHECKs: `final_price >= seller_net_price * (1 + hard_floor)` unless `is_bypass`; `roogo_margin = final_price - seller_net_price - fees` for non-bypass rows.
   - RLS on; service role only (same pattern as `sale_intakes`).
4. Index `visit_requests(buyer_id, property_id)` if missing: it is the evidence for "buyer Roogo introduced" under the bypass clause.

### 2. Shared calculation: `lib/sale-economics.ts` (+ mobile mirror `roogo/constants/sale-economics.ts`)

Pure functions, no I/O, fully unit-tested:
- `priceLadder(net, snapshot)` → `{ listing, target, teamFloor, hardFloor }` (rounded to the nearest 50,000 FCFA for display; store exact).
- `settle(finalPrice, net, snapshot, { buyerReferred, sellerReferred })` → `{ notaryFee, buyerReferralFee, sellerReferralFee, roogoMargin, belowTeamFloor, belowHardFloor }`.
- `bypassFee(finalPrice, snapshot)`.
- Tests: the 35M table from the vault decision (45.5 / 42 / 40.25 / 38.5 across the three helper cases), boundary at exactly +10% and +15%, rounding, negative-margin guard.

### 3. Mandate send and sign (`lib/sale-mandate.ts`)

- `sendMandate({ propertyId, staffId, sellerNetPrice, exclusivityDays })`: reads v3 config, writes `economics_version = 'v3'` + snapshots + `seller_net_price`; `mandate_offer` metadata carries `seller_net_price`, `exclusivity_days`, `bypass_months`, `bypass_fee_pct`, `terms_version`.
- `signMandate`: on v3, set `properties.price = priceLadder(net).listing` (the +30% listing price) and `properties.seller_asking_price = net`. Keep v2 behavior for v2 rows.
- `MANDATE_TERMS_VERSION = "2026-10-v3"` in `lib/sale.ts` and `roogo/constants/sale.ts`.

### 4. Seller-facing mandate text (French, both apps)

Card content on v3, in plain words (no em dashes, no emoji):
- "Vous recevez **{net}** net à la vente. Ce montant est garanti."
- "Roogo fixe le prix de vente au-dessus de ce montant. La différence couvre le notaire, les éventuels apporteurs d'affaires et la rémunération de Roogo."
- "Exclusivité : {n} jours."
- "Si le bien est vendu dans les {12} mois à un acheteur présenté par Roogo, même sans passer par Roogo, des frais de {10} % du prix de vente sont dus à Roogo."
- Full terms text behind a "Lire les conditions" link, versioned by `MANDATE_TERMS_VERSION`.

**The terms text needs a legal read by someone who knows Burkina Faso contract law before the first real v3 mandate is sent.**

### 5. Admin (web)

- `app/admin/parametres`: new "Vente (v3)" section editing the config in step 1; hide v2 fields (read-only history).
- `app/admin/sale-chat`: mandate form takes the **net price**; preview shows the ladder (listing / target / team floor / hard floor) and the 35M-style breakdown at the target price.
- New closing panel on the listing (`components/admin/AdminListingDetail.tsx`): enter final price, buyer, referrers (from sale referrals once built, free text until then); show the computed breakdown; block save below hard floor; require founder approval between hard and team floor; mark notarized / Roogo paid / settled.

### 6. Mobile (`roogo`)

- `app/sale-chat/[id].tsx`: v3 mandate cards (net guaranteed, exclusivity, bypass line); keep v2 rendering for old messages (branch on metadata fields present).
- `app/(tabs)/add-property.tsx`: replace the "10% commission" consent with the v3 explanation (guaranteed net, Roogo sets the price, bypass clause), acknowledged before submission.
- JS-only change → OTA per the delivery policy, unless it ships with native work.

### 7. APIs

- `app/api/pricing/route.ts`: expose v3 fields the apps need for copy (bypass months/pct, exclusivity default); stop exposing v2 percentages to new clients (keep for old binaries until the next forced update).
- `app/api/sale-chat/conversations/[id]/mandate/route.ts`: accept `sellerNetPrice` (validate > 0 in `lib/validations.ts`).
- New `app/api/admin/sales/[propertyId]/closing/route.ts` (staff; founder-only for below-team-floor approval).

## Rollout

1. Migration 075 (hand the SQL to Salif: the production Supabase project is under a different login).
2. Web lib + tests + admin; deploy.
3. Mobile cards and consent via OTA; bump web `app-version` only if a store build is needed.
4. Send the first v3 mandate on a real property (Pabré) after the legal read of the terms text.
5. Record in `docs/CHANGELOG.md`, `docs/DECISIONS.md`, and the vault (policy moves from "implementation pending" to "implemented"; production only after a real mandate is verified).

## Out of scope (next plan)

Sale referrals (1% / 2%): registration, confirmation call, 60-day buyer-claim expiry, "Attestation de parrainage" PDF with QR verification, payout after `sale_closings.status = settled`. Depends on `sale_closings` from this plan.

## Open questions for Salif

1. Round listing prices to the nearest 50,000 FCFA (or 100,000)?
2. Should the seller see the listing price at all? v2 hid it; v3 is disclosed in principle (the mandate says Roogo sets a higher price) but the exact public price can stay hidden from the seller.
3. Old v2 mandates already signed (if any): leave them on v2 or re-sign under v3?
