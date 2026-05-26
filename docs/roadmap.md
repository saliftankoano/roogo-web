# Roadmap

This document tracks major product features that need durable implementation
context beyond code comments. Each feature should capture the product intent,
business rules, data model, rollout notes, and test coverage.

## Feature Checklist

Use this list as the quick completion view for major features.

- [x] Referral / Roogo Pro Agent Pilot - developed, pending database migration
  and production QA
- [ ] Owner-side rent-received push notification - send a push to the owner
  when their tenant pays rent (today only the renter is notified)

## [x] Referral / Roogo Pro Agent Pilot

Status: implemented, pending database migration and production QA

Public name: Roogo Pro Agent  
Internal naming: referrer / referral

### Goal

Create a referral capability on top of existing Roogo accounts. A user applies
to become a referrer, submits identity verification, gets staff approval, and
receives a unique referral code. Owners and agents can apply that code during
their first paid listing checkout.

The pilot is optimized for qualified supply growth: a referral only becomes
commissionable after the referred user pays for a listing and the property is
created.

### Pilot Economics

- Referred owner/agent discount: 5% of the original paid listing amount.
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
- Only `owner` and `agent` users can redeem a referral code.
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
  - owner or agent uses the code during listing checkout
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
