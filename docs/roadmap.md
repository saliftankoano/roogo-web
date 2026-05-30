# Roadmap

This document tracks major product features that need durable implementation
context beyond code comments. Each feature should capture the product intent,
business rules, data model, rollout notes, and test coverage.

## Feature Checklist

Use this list as the quick completion view for major features.

- [x] Referral / Roogo Pro Agent Pilot - developed; referral UI, admin review,
  checkout pricing, commission creation, and approval-state handling are in
  place; pending database migration and production QA
- [ ] CINET card payments for diaspora renters - enable card payments through
  CINET so users abroad can reserve and rent homes before arriving
- [ ] Owner-side rent-received push notification - send a push to the owner
  when their tenant pays rent (today only the renter is notified)

## [x] Referral / Roogo Pro Agent Pilot

Status: implemented; pending database migration and production QA

Public name: Roogo Pro Agent  
Internal naming: referrer / referral

### Goal

Create a referral capability on top of existing Roogo accounts. A user applies
to become a referrer, submits identity verification, gets staff approval, and
receives a unique referral code. Owners, agents, and internal staff/founder
accounts can apply that code during paid listing checkout.

The pilot is optimized for qualified supply growth: a referral only becomes
commissionable after the referred user pays for a listing and the property is
created.

### Completion Notes

Implemented behavior:

- Existing Roogo users can apply to become referrers from `/parrainage`.
- Renters, owners, and agents can apply as referrers; this is an account
  capability, not a new `user_type`.
- Referral code visibility is approval-gated. Pending, rejected, and suspended
  users do not receive the code in the public profile API response.
- Staff can review, accept, reject, and suspend referrers from
  `/admin/parrainage`.
- Approved referrers can see their code, share URL, qualified listings, pending
  commissions, and paid commissions.
- Owners, agents, staff, founders, and admins can apply a valid referral code
  during paid listing checkout.
- Referral discount and commission amounts are computed by the backend.
- Referral redemption and commission finalization are tied to successful
  payment plus property creation, not merely code entry.
- Admin UI copy and public `/parrainage` copy are localized in French.

Remaining completion work:

- Apply the referral database migration in production.
- Create/verify the private `referrer-verification` storage bucket in
  production.
- Run production end-to-end QA with a real staff approval and paid listing
  flow.

### Functional Flow

```mermaid
flowchart TD
  A["Existing Roogo user"] --> B["Opens /parrainage"]
  B --> C["Submits referrer application"]
  C --> D["Uploads ID front/back + payout details"]
  D --> E["Profile status: pending"]

  E --> F["Staff reviews in Admin > Demandes > Parrainage"]

  F -->|Reject| G["Status: rejected"]
  G --> H["User sees rejection reason and can reapply"]

  F -->|Suspend| I["Status: suspended"]
  I --> J["Code cannot be used"]

  F -->|Accept| K["Status: approved"]
  K --> L["Unique referral code becomes visible"]
  L --> M["Referrer shares code or link"]

  M --> N["Owner or agent starts paid listing checkout"]
  N --> O["Owner/agent enters referral code"]

  O --> P["Backend validates code"]
  P -->|Invalid| Q["No discount applied"]
  P -->|Valid| R["Backend recomputes listing total"]

  R --> S["Apply 5% discount to referred user"]
  S --> T["Create pending payment metadata"]
  T --> U["User pays discounted listing amount"]

  U -->|Payment fails or expires| V["Referral redemption voided"]
  U -->|Payment succeeds| W["Property/listing is created"]

  W --> X["Referral redemption becomes qualified"]
  X --> Y["Commission created idempotently"]
  Y --> Z["Referrer sees pending commission"]

  Z --> AA["Founder handles manual payout"]
  AA --> AB["Commission marked paid"]
```

Functional explanation:

- A referrer is any existing Roogo account with an approved
  `referrer_profiles` record.
- Renters can become referrers, but renter actions do not qualify for referral
  redemption. The referred user who uses the code must be an owner, agent,
  staff, founder, or admin.
- Staff approval controls when the referral code becomes visible and usable.
- Entering a referral code only reserves referral context for the payment. It
  does not create a payable commission by itself.
- The referred paid-listing user receives a 5% discount on the paid listing
  checkout.
- The referrer receives 5% of the discounted paid listing amount after payment
  completes and the property is created.
- Payouts remain manual in v1. Founder/admin marks commissions paid after the
  payout is handled outside the automated payment flow.

### Pilot Economics

- Referred paid-listing user discount: 5% of the original paid listing amount.
- Referrer commission: 5% of the discounted paid listing amount.
- Commission is manual payout only in v1.
- Commission becomes payable only after payment is completed and the property
  exists.

Formula:

```text
original_amount = listing publication fee + listing commission + selected add-ons
discount_amount = round(original_amount * 0.05)
paid_amount = original_amount - discount_amount
commission_amount = round(paid_amount * 0.05)
roogo_before_processor_fees = paid_amount - commission_amount
```

Concrete example:

```text
original_amount = 20,000 XOF
discount_amount = 1,000 XOF
paid_amount = 19,000 XOF
commission_amount = 950 XOF
roogo_before_processor_fees = 18,050 XOF
```

Roogo keeps 18,050 XOF, or 90.25% of original listing revenue, before payment
processor fees.

### Product Rules

- Do not add `referrer` to `users.user_type`; referrer is an additional
  capability on an existing account.
- Referral codes are generated server-side and are readable, for example
  `ROOGO-ARUN-7K2`.
- Only approved referrer profiles can be used.
- Suspended, rejected, pending, or missing profiles cannot redeem.
- Self-referrals are rejected.
- `owner`, `agent`, `staff`, `founder`, and `admin` users can redeem a
  referral code during paid listing checkout.
- A referred user can qualify only one paid listing referral.
- Referral only applies to `listing_submission` transactions with a positive
  amount.
- Free daily listings without paid add-ons do not create discounts or
  commissions.
- Client-sent totals are display-only. The backend recomputes listing totals
  from tier, rent, frequency, add-ons, and `listing_config`.

### Data Model

Migration:

- `supabase/migrations/024_referral_program.sql`

Tables:

- `referrer_profiles`
  - One row per approved/applying account.
  - Stores code, status, identity image paths, payout phone/provider, reviewer,
    and rejection reason.
- `referral_redemptions`
  - Audit record for each attempted qualified paid listing referral.
  - Stores code used, referred user, transaction, property, original amount,
    discount, paid amount, and status.
  - Enforces one qualified referral per referred user.
- `referral_commissions`
  - Manual payout ledger.
  - One commission per redemption.
  - Founder marks paid in v1.

Storage:

- Private Supabase bucket: `referrer-verification`
- ID image access is server-only through staff/founder admin APIs.

### Backend Surfaces

Core helper:

- `lib/referrals.ts`

Public/referrer APIs:

- `GET /api/referrals/me`
- `POST /api/referrals/apply`
- `POST /api/referrals/validate`

Admin APIs:

- `GET /api/admin/referrals`
- `PATCH /api/admin/referrals/[id]`
- `PATCH /api/admin/referrals/commissions/[id]`

Payment integration:

- `POST /api/payments/paymentpage`
- `POST /api/payments/initiate`
- `POST /api/payments/status`
- `POST /api/properties`

Important backend behavior:

- Payment metadata stores referral code/profile, original amount, discount,
  paid amount, and commission amount.
- Payment initiation creates a pending redemption when a valid referral is
  applied.
- Failed payments void pending referral redemptions.
- Property finalization qualifies the redemption and creates the commission
  idempotently.
- Repeated callbacks or polling must not duplicate commissions or reset a paid
  commission back to pending.

### Product Surfaces

Web:

- `/parrainage`
  - Signed-in users apply as referrers.
  - Approved referrers see code, share URL, qualified listings, pending
    commission, and paid commission.
- Listing checkout
  - Referral code field in payment summary.
  - Shows original amount, discount, amount due, and referrer name when known.
- `/admin/parrainage`
  - Verification queue.
  - Approved/suspended referrers.
  - Open commissions.
  - Paid commission history.

Mobile:

- Listing checkout step includes a referral code field.
- Mobile sends only referral code and listing inputs.
- Backend returns and persists authoritative discounted amount.

### Rollout Checklist

- Apply `024_referral_program.sql` to Supabase.
- Confirm `referrer-verification` bucket exists and remains private.
- Verify service role access can create signed ID image URLs for admin review.
- Confirm staff can approve/reject/suspend referrers.
- Confirm founder-only paid commission action in production.
- Run one manual end-to-end QA flow:
  - existing renter/owner/agent applies at `/parrainage`
  - staff approves profile
  - eligible paid-listing user uses the code during listing checkout
  - hosted payment completes
  - property is created
  - redemption becomes qualified
  - commission appears pending
  - founder marks commission paid

### Test Coverage Target

Automated tests should cover:

- Code generation uniqueness and normalization.
- Active, inactive, suspended, and missing code validation.
- Self-referral rejection.
- Wrong user type rejection.
- Duplicate qualified redemption rejection.
- Rounding for discount and commission amounts.
- Web hosted payment metadata preservation.
- Mobile hosted payment metadata preservation.
- Direct mobile money listing payment metadata preservation.
- Repeated payment status polling.
- Repeated property finalization.
- Admin approve, reject, suspend, and mark-paid permissions.

Current verification run:

- `roogo-web`: `npm run lint`
- `roogo-web`: `npm run build`
- `roogo`: `npm run lint`

### Excluded From V1

- Automated PawaPay payouts.
- Recurring rent commissions.
- Multi-level referral trees.
- Public referrer leaderboards.
- New `user_type` values.

### Open Questions

- Whether the pilot should cap monthly commission per referrer.
- Whether payout approval should require a second reviewer before founder
  marks paid.
- Whether referral share links should prefill checkout code from `?ref=...`.
- Whether rejected referrers should be allowed to reapply indefinitely or after
  staff unlock.

## [ ] CINET Card Payments For Diaspora Renters

Status: not started, added 2026-05-27

Public name: card payment / diaspora payment  
Provider naming: CINET

### Goal

Add CINET as a card-payment provider so customers outside Burkina Faso and the
West African mobile-money corridor can pay with a bank card. This is especially
important for diaspora users who want to secure housing before traveling: they
should be able to pay the required Roogo amount remotely, complete the rental
flow, and arrive with access already arranged.

This expands Roogo payment coverage beyond local Mobile Money and makes the
product usable for customers abroad who do not have Orange Money or Moov Money.

### Product Scope

- Add a card-payment option to checkout flows where a user needs to pay Roogo:
  - listing submission payments
  - property lock / reservation payments
  - rent payments, if supported by the provider economics
- Keep existing Mobile Money options unchanged.
- Show CINET/card payment as a distinct payment method, not as a replacement
  for PawaPay.
- Support diaspora users paying from outside Burkina Faso.
- Preserve payment status handling through hosted redirects, callbacks, and
  polling so the user can safely return to Roogo after payment.
- Use existing confirmation behavior after successful payment:
  - listing payment creates/finalizes the property
  - reservation payment locks the property
  - rent payment credits the owner wallet

### Business Rules

- Backend remains the source of truth for all payable amounts.
- Client-sent totals are display-only.
- Payment metadata must include enough audit data to reconcile provider
  callbacks with Roogo records:
  - transaction id
  - user id
  - payment purpose
  - property id when applicable
  - original amount
  - fees, if known
  - currency
  - provider reference
- Payment completion should be idempotent. Repeated callbacks, refreshes, or
  polling must not create duplicate properties, locks, rent credits, or
  commissions.
- Failed, abandoned, or expired CINET payments must leave the related checkout
  flow recoverable.
- If CINET settles in a different currency or charges card-processing fees,
  Roogo must record the display currency, settlement currency, and fee basis
  clearly before launch.

### Integration Notes

- Confirm the exact provider product/API name, merchant account requirements,
  supported countries, supported card networks, settlement currency, and fee
  schedule before implementation.
- Add shared provider abstractions instead of branching payment logic directly
  inside every route.
- Reuse the current payment transaction table where possible; add provider
  fields only if the existing schema cannot safely represent CINET references.
- Hosted payment redirects must preserve the same pending listing/payment
  metadata currently used by PawaPay flows.
- Refund, chargeback, and failed authorization behavior needs an explicit admin
  operations path before enabling high-value rent payments.

### Product Surfaces

Web:

- Listing checkout payment summary includes a card payment option.
- Reservation/property lock checkout includes a card payment option.
- Payment callback page handles CINET return states in French.
- Admin finance views show provider as CINET/card and expose provider
  reference for reconciliation.

Mobile:

- Mobile checkout sends the selected payment provider and receives an
  authoritative hosted payment URL or payment session from the backend.
- Mobile should not calculate final payable totals locally.
- Return/deep-link handling should bring the user back to the relevant listing,
  reservation, or rent-payment status screen.

### Rollout Checklist

- Confirm CINET merchant onboarding and production credentials.
- Confirm supported currencies and whether XOF card payments settle in XOF.
- Confirm processor fees and decide whether fees are absorbed by Roogo or
  passed to the payer.
- Implement sandbox payment initiation, callback verification, and status
  polling.
- Add production webhook/callback URLs.
- Run manual QA from outside the local Mobile Money path:
  - diaspora user starts a card payment
  - hosted payment completes
  - Roogo receives callback
  - checkout finalizes exactly once
  - admin finance page shows provider reference
  - failed/abandoned card payment can be retried

### Test Coverage Target

- API tests for CINET payment initiation and callback signature validation.
- Payment status mapping tests for success, pending, failed, expired, and
  cancelled states.
- Idempotency tests for repeated CINET callbacks and repeated polling.
- Web checkout tests for selecting card payment and preserving pending metadata
  through redirect.
- Mobile contract tests for provider selection and returned hosted payment URL.
- Admin finance tests for CINET provider labels, references, and reconciliation
  data.

### Open Questions

- Is the intended provider name exactly CINET, or should public/internal naming
  use CinetPay if that is the actual vendor?
- Which flows should launch first: listing payments, reservations, rent, or all
  payment purposes at once?
- Should Roogo absorb card-processing fees for diaspora conversion, or pass
  them through transparently at checkout?
- What should happen for card chargebacks after a property is already locked or
  a rent payment already credited to an owner wallet?

## [ ] Owner-side rent-received push notification

Status: not started, surfaced 2026-05-26 during marketing script verification
against the live code.

### Goal

Send a push notification to the **property owner** when their tenant pays rent
through Roogo. Today only the renter is notified ("Loyer payé / Votre paiement
de loyer a été confirmé"). The owner has no signal that money has landed in
their Roogo wallet — they only see new `availableRentCredits` if they happen
to open the app.

Closing this loop is high-leverage: it lets owners feel the product working
without needing to remember to check, and turns each rent payment into a moment
of trust ("Roogo just notified me my tenant paid"). It is also the climax beat
of the upcoming marketing video (see
`marketing/video-009-monthly-rental/script_FR.md`); shipping this push lets
that beat be filmed against the real product instead of a fictionalized
notification.

### Scope

- Send a push to `schedule.owner_id` immediately after
  `creditOwnerEarningForSchedule()` succeeds in both payment confirmation
  paths:
  - `app/api/payments/status/route.ts` (sync confirmation when the client
    polls)
  - `app/api/pawapay/callback/route.ts` (async confirmation from PawaPay
    webhook)
- Notification copy (FR primary, mirror keys in `roogo/locales/messages.ts`):
  - Title: `Loyer reçu`
  - Body: ``${renterFirstName} a payé son loyer. ${netAmount} FCFA
    disponibles à retirer.`` — use **net** amount (after 7% commission)
    since that is what the owner can actually withdraw.
- Data payload: include `earningId`, `scheduleId`, `propertyId`,
  `netAmount`, `grossAmount`, `feeAmount`, `currency` so the mobile app can
  deep-link to the wallet screen and pre-stage the payout sheet.
- Respect the user's notification preferences (`notifications.payments`) via
  the existing `notifyUser` helper.

### Implementation Notes

- Fetch renter `first_name` from the schedule's `agreement.renter` to
  personalize the body. Fallback to `Votre locataire` if name is missing.
- Use `calculateOwnerRentAmounts(schedule.amount)` for net/fee/gross — single
  source of truth, no duplicated math.
- Add a guard so the push only fires when `creditOwnerEarningForSchedule`
  returned `{ credited: true }` (avoid double-firing on retries when the same
  schedule is re-credited and the unique constraint short-circuits).
- Both confirmation paths (status route + pawapay callback) duplicate the
  rent-payment handling today. Extract a single helper
  `lib/owner-wallet.ts::notifyOwnerOfRentCredit(earningId)` and call it from
  both — don't fork the notification body in two places.

### Mobile follow-up (`roogo`)

- When the push is tapped, deep-link to the owner wallet
  (`/(tabs)/my-properties/wallet`) and optionally open `OwnerPayoutSheet` if
  exactly one available credit is staged.
- No new screens required; existing wallet UI is sufficient.

### Test Coverage

- Manual end-to-end: create a rental agreement, pay rent via PawaPay sandbox
  number (see `roogo-web/docs/pawapay-test-numbers.md`), confirm both renter
  and owner receive their respective push notifications, confirm wallet shows
  new credit, confirm "Retirer" payout completes.
- Negative: tenant pays the owner directly outside the app (cash, separate
  Mobile Money transfer) → no push to owner (already true today, just verify
  the new code path doesn't accidentally fire).
- Preferences off: owner who disabled `payments` notifications should not
  receive the push.

### Open Questions

- Body shows net (after 7%) or gross? Net is the more honest framing — it is
  what the owner can withdraw — but gross feels larger and more rewarding.
  Default to **net** for transparency, revisit if engagement data suggests
  otherwise.
- Batch multiple rent payments arriving within a short window into a single
  push (e.g., property with multiple units)? Probably not for v1 — one push
  per rent is the simplest mental model. Revisit if owners report noise.
