# Roogo Web and Backend

Roogo's public property website, owner/agent workspace and staff operations dashboard for Burkina Faso. This Next.js repository also owns the authenticated API and database migrations used by the [Roogo mobile app](https://github.com/saliftankoano/roogo).

## Repository responsibilities

- Property rental/sale discovery, listing creation, review and publication.
- Agreements, rent collection, reservations, hotels, sale operations and 3D visits.
- Clerk authentication and user synchronization, Supabase data/storage and server-side authorization.
- PawaPay customer payments, payment reconciliation and notification delivery.
- Staff/founder operations and the host-specific Roogo Mebo advertising surface.

The mobile app is a client of this backend. Server rules, not client prices or browser-return parameters, decide payment ownership, price, status and fulfillment.

## Failed-payment notifications and safe recovery

[Backend PR #29](https://github.com/saliftankoano/roogo-web/pull/29) and [mobile PR #29](https://github.com/saliftankoano/roogo/pull/29) add clear failure explanations and recovery that preserves an unresolved or already-paid deposit.

The feature covers customer-initiated reservations, rent, listings, boosts, hosted payments and 3D visits. Owner payouts, refunds and a notification inbox are outside its scope.

- **Explain a definitive failure:** controlled French/English messages for insufficient balance, payment not approved, another payment in progress, payer/provider mismatch and provider unavailability. Unknown codes use a safe generic message. Provider support text is never customer copy.
- **Notify without duplicate sends:** one delivery record per deposit; push for eligible registered tokens, otherwise SMS to the normalized Mobile Money payer number. Payment notification opt-outs are honored. SMS alerts sharing a phone hash and failure code have a 15-minute cooldown.
- **Keep uncertainty separate from failure:** timeouts, malformed responses and unsuccessful HTTP status lookups retain the original deposit for reconciliation. They do not authorize another charge.
- **Separate payment from fulfillment:** `NEEDS_SUPPORT` means money was collected but the reservation is unconfirmed. Retain the reference and offer support, not another payment.
- **Protect paid listings:** one deposit funds one listing, even after property deletion. Creation amenities commit atomically; submission/link failures recover the original listing rather than charge again.
- **Recover mobile browser handoffs:** persist the deposit/page URL before opening the browser; Verify status and Resume payment are independent actions.

### Current status

**Database prerequisites executed and verified on Roogo on 2026-09-09; feature release still pending.**

| Migration | Status | Database responsibility |
| --- | --- | --- |
| [070](./supabase/migrations/070_payment_failure_notifications.sql) | Executed | Failure fields, delivery claims, cooldown and send boundaries |
| [071](./supabase/migrations/071_atomic_property_lock_payments.sql) | Executed | Atomic property reservation/finalization |
| [072](./supabase/migrations/072_atomic_listing_payments.sql) | Executed | Single-use listing payments, durable consumption and atomic amenities |

See the [execution ledger](./supabase/migrations/README.md) for the exact project, UTC times, checksums and verification. Applying SQL does not deploy the PR's API/screens or prove push/SMS delivery. These applied files are now immutable; future database changes require a new migration.

**Open release blocker:** mobile can become trapped after reopening an old successful payment link without its original listing draft. This documentation/migration task did not fix that review finding. Backend deployment, the mobile fix/release and native/provider acceptance checks remain in [ROADMAP.md](./docs/ROADMAP.md#now).

## Development

```sh
npm install
npm run dev
npm test
npx tsc --noEmit --incremental false
npm run lint -- --max-warnings=0
```

The development server listens on port 3000. See [.env.example](./.env.example) and [CLAUDE.md](./CLAUDE.md) for configuration and architecture. Keep Clerk, Supabase service-role, payment and messaging credentials server-side; never place them in mobile `EXPO_PUBLIC_*` variables.

Current production migration history records only 070–072: older schema existed without a history table. **Do not run an unrestricted `supabase db push` or mark 001–069 applied by assumption.** Older history needs a separate audit before adopting a full CLI migration baseline.

## Project memory

- [DOMAIN](./docs/DOMAIN.md): payment, fulfillment and listing-consumption vocabulary.
- [SYSTEM](./docs/SYSTEM.md#how-do-failed-and-uncertain-customer-payments-recover): contracts, recovery, operational boundaries and code map.
- [DECISIONS](./docs/DECISIONS.md): why uncertainty must not cause another charge/send.
- [CHANGELOG](./docs/CHANGELOG.md): verified database changes and released behavior.
- [ROADMAP](./docs/ROADMAP.md#now): known blockers and unfinished release checks.

## Payment Testing Scenarios (Web + Mobile)

### Monthly listing payment modes

- `free_success_fee`: 0 XOF at submission; one fee equal to 50% of the listed
  monthly rent is stored and collected from the first rent Roogo receives.
- `upfront_package`: the selected pack, monthly-rent commission, and add-ons are
  paid before the listing is created; no deferred success fee is stored.
- `daily_free`: daily inventory is submitted without the monthly success fee.

All monthly `free_success_fee` submissions require explicit acceptance. Later
rent collection is enabled by default when a monthly agreement becomes active;
the owner can opt out for future unpaid installments, and the 7% collection fee
applies only to rents paid through Roogo. See `docs/SYSTEM.md` for settlement,
opt-out, and idempotency details.

Use this section as the source of truth when testing payments locally.

### Where each variable lives

- **Backend repo (`roogo-web/.env.local`)** controls payment provider mode:
  - `PAWAPAY_LOCAL_MODE=sandbox|live`
  - `DEV_PRICING_OVERRIDE=true|false`
- **Mobile repo (`roogo/.env.local`)** controls mobile UI pricing display + backend target:
  - `EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:3000`
  - `EXPO_PUBLIC_DEV_PRICING_OVERRIDE=true|false`

### Important behavior

- Mobile app always pays through backend routes, so **sandbox vs live is decided by backend env**.
- `DEV_PRICING_OVERRIDE` changes pricing response used for payment amount calculation in local testing.
- After changing env vars, **restart dev servers** (`roogo-web` and mobile app packager).

### Scenario Matrix

#### 1) Sandbox + Normal Pricing

Backend (`roogo-web/.env.local`):

```bash
PAWAPAY_LOCAL_MODE=sandbox
DEV_PRICING_OVERRIDE=false
```

Result:

- PawaPay sandbox
- normal pricing locally
- no real money charged

#### 2) Sandbox + Dev Pricing

Backend (`roogo-web/.env.local`):

```bash
PAWAPAY_LOCAL_MODE=sandbox
DEV_PRICING_OVERRIDE=true
```

Result:

- PawaPay sandbox
- lowered local test pricing
- no real money charged

#### 3) Live + Dev Pricing (recommended low-cost real flow test)

Backend (`roogo-web/.env.local`):

```bash
PAWAPAY_LOCAL_MODE=live
DEV_PRICING_OVERRIDE=true
```

Result:

- PawaPay live
- lowered local test pricing (for example 100 XOF)
- real money charged with low cost

#### 4) Live + Normal Pricing

Backend (`roogo-web/.env.local`):

```bash
PAWAPAY_LOCAL_MODE=live
DEV_PRICING_OVERRIDE=false
```

Result:

- PawaPay live
- normal pricing locally
- real money charged at normal price

### Mobile-specific checklist

In `roogo/.env.local`:

```bash
EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:3000
EXPO_PUBLIC_DEV_PRICING_OVERRIDE=true
```

Notes:

- `EXPO_PUBLIC_API_URL` must point to your local backend when testing from a physical device.
- Mobile `EXPO_PUBLIC_DEV_PRICING_OVERRIDE` changes what user sees in mobile UI, but payment environment still comes from backend `PAWAPAY_LOCAL_MODE`.
