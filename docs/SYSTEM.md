# System

Reference answers to "how does X work" questions worth keeping. Organized by topic,
not dated. For the reasoning behind these, see [`DECISIONS.md`](./DECISIONS.md); for
what shipped and when, see [`CHANGELOG.md`](./CHANGELOG.md).

---

## How do staff access levels work?

Every staff member has a **level** that matches their job title: `director`, `assistant`, `advisor` or `intern`. The founder (`userType: "founder"`) is always the founder level and never has a stored level. The matrix of what each level can do is code in [`lib/staff-access.ts`](../lib/staff-access.ts) (`STAFF_CAPABILITY_MATRIX`); it is the approved matrix from the vault note "Permissions de l'equipe par titre" (2026-10-11). Change the note first, then the code.

- **Where the level lives.** Clerk `publicMetadata.staffLevel` (read by the browser and by routes that read the Clerk session) mirrored in `users.staff_level` (read by routes that load the Supabase user). The team page writes both. `lib/user-sync.ts` mirrors it when Clerk sends a user update.
- **How routes check it.** Pass a capability: `getStaffOrFounder(req, "talent.manage")`, `requireStaffSupabaseUser("identity.review")`, `requireClerkStaffCapability(...)`, `userRowCan(user, ...)`. Routes without a capability still accept any staff member, so a new admin route must name one. Sensitive routes done: listing delete and publish, identity and ownership documents, users list, disputes, referrals, talent, rental imports, pending edits, support, sale-chat replies, finances, voice cloning, glossary moderation.
- **Pages.** `app/admin/<section>/layout.tsx` wraps each section in `StaffRouteGuard` (server side). The navigation and buttons use `useStaffAccess()`, fed by the admin layout so they agree with the API.
- **Rollout switch.** `STAFF_LEVELS_ENFORCED=true` makes a staff member without a level act as `advisor`. While it is not set they act as `legacy`: exactly the access staff had before levels. Staff who have a level are bound by the matrix either way. Turn the switch on only after every real staff member has a level on `/admin/acces/niveaux`.
- **Giving access.** `/admin/acces/niveaux`, tab « Niveaux et invitations » of « Accès » (founder and directors; the tab is hidden for others and the route is guarded by `team.manage`). The founder gives or removes any level; a director gives assistant, advisor and intern, never director; nobody changes their own level. A person joins with an invitation link (valid 7 days, tied to an email address, only its hash stored) on `/personnel/rejoindre`; the inviter's right is checked again when the link is accepted. Every invitation, acceptance, level change and removal is written to `staff_access_log`; the founder reads all of it, a director reads their own.
- **Titles on the team board are the levels.** The briefing and the L'équipe board (`/admin`, `/admin/equipe`) read the same level (`director` is Directeur, `assistant` Assistant(e) commercial(e), `advisor` Conseiller(ère), `intern` Stagiaire; no level counts as Conseiller(ère) there). Changing a title on the board calls the same `setMemberLevel` as `/admin/acces/niveaux`, so it is logged and synced to Clerk. The `staff_titles` table from `089_staff_tasks_executed.sql` exists on Roogo but is not read.
- **Studio caps.** Setting a level also sets the person's monthly Studio caps (`studio_user_limits`) to the approved amounts (`STUDIO_CAPS_BY_LEVEL`).
- **The shared staff code** (`STAFF_REGISTRATION_SECRET`) still works until the variable is deleted in Vercel, but it can now only create the `intern` level and never touches a founder. Delete the variable once invitations are in use.
- **Not built yet.** The 30-day temporary extra access, the monthly access review (a working rule), advisor listings needing approval beyond going online, and per-route checks on the remaining staff routes (open-house slots, hotel events, property requests, Studio routes other than cloning).

---

## How do public listing photos load and recover?

Public discovery uses a photo variant that matches its layout, an immutable source URL for each new photo, and a homepage shell that can render while featured annonces load. [Annonce](./DOMAIN.md#annonce) is a public listing, not private ownership evidence.

On the homepage and search page, responsive image hints include the container padding, grid gaps and card borders. Detail and fullscreen images have separate hints. Other PropertyCard callers retain their existing default. The optimizer chooses an available variant from these hints; this change does not replace the optimizer or alter photo quality/loading priority.

New property single/batch and room-type uploads set `cacheControl=2592000` and disable overwrites. Single uploads derive their URL from the photo bytes; edited content gets a new URL. Batch and room-type uploads use UUID filenames. Existing photos keep their prior headers. Private documents, avatars and the global Next cache floor retain their policies.

An identical single-photo retry returns the linked record before checking the gallery cap. If the storage object exists without a link, the route attempts to recover the link. Migration 073 permits one content-addressed URL per property: competing inserts return the record that committed. A failed insert keeps the shared object available for later recovery; removing it after a lookup could delete another request's linked photo. Lost database responses also recheck the link. Deletion still follows the saved URL, and already cached public copies may remain until expiry. Abandoned unlinked objects and legacy backfill remain limitations, not cleanup work delivered here.

The homepage passes an async featured-listing section through a ReactNode slot behind Suspense. The hero and its preload can stream first; the section separately shows a skeleton, a genuine empty result or an unavailable message on query/malformed-data failure. Other property-query callers keep their previous error handling. The real-route regression test runs in a disposable source copy, so generated Next output cannot overwrite the working checkout's production build.

[#32](https://github.com/saliftankoano/roogo-web/pull/32) and [#33](https://github.com/saliftankoano/roogo-web/pull/33) merged on 2026-09-13 UTC. [#34](https://github.com/saliftankoano/roogo-web/pull/34) merged at 00:42:44 UTC the same day, commit `4832b90`. Homepage streaming and the logbook/migration-filename updates are now in main; this merge does not establish production deployment or measured savings. Salif reports migration 073 applied; see the [execution ledger](../supabase/migrations/README.md). Layout measurements, 14 image tests and four delayed-query streaming scenarios passed. Production cache headers, stream behavior and measured savings remain release checks. See the [decision](./DECISIONS.md#public-listing-image-loading-uses-layout-sizing-immutable-sources-and-a-streaming-shell--2026-09-13) and [release gate](./ROADMAP.md#now).

## How are executed migration filenames recorded?

Files named `<version>_<name>_executed.sql` represent migrations confirmed executed on Roogo. The suffix is an operational record for that database; it does not mean that a fresh or test database already has the schema. New migrations omit the suffix until their execution is confirmed and recorded.

All 001–073 are marked on Salif's confirmation dated 2026-09-13 UTC. The [ledger](../supabase/migrations/README.md) preserves the stronger SQL/history/effects verification for 070–072 from 2026-09-09 and labels the remainder as operator-reported. Each renamed SQL file remains byte-identical; tests and links read its new path, while original names in SQL comments remain historical. Database migration-history names and recorded SQL are unchanged. Renaming files is not history reconciliation and does not make an unrestricted database push safe.

Treat earlier production-migration checklist wording as a historical snapshot when it conflicts with this current execution record. App/device validation gates remain separate. Consult the target environment's actual history/schema before applying any SQL; future changes use a new numeric version. See the [filename decision](./DECISIONS.md#executed-migration-filenames-preserve-sql-and-the-source-of-execution-evidence--2026-09-13).

## How do failed and uncertain customer payments recover?

Roogo keeps payment collection, reservation fulfillment and notification delivery separate. This behavior is implemented in [web PR #29](https://github.com/saliftankoano/roogo-web/pull/29) and [mobile PR #29](https://github.com/saliftankoano/roogo/pull/29); both remain open as of 2026-09-09. Database prerequisites 070–072 were executed and verified on Roogo that day; the API/mobile feature has not been released by this task. See the [execution ledger](../supabase/migrations/README.md). Local tests and the web preview do not establish production release.

The shared failure flow covers customer-initiated reservation, rent, listing, boost, hosted-payment and 3D-visit deposits. Owner payouts and refunds are outside this notification feature. The server saves the [deposit reference](./DOMAIN.md#pawapay-deposit) before requesting collection.

| Observed result | Meaning and handling |
| --- | --- |
| Ambiguous initiation response | Preserve the saved deposit for polling/callback reconciliation. HTTP 408/5xx without a definitive provider rejection, unreadable bodies and interrupted response reads do not establish failure. |
| Unsuccessful status lookup | Leave the saved payment unchanged. An upstream HTTP 404/4xx/5xx is not proof of a missing deposit; only a successful parsed `NOT_FOUND` can enter not-found reconciliation. Generic upstream HTTP failures return retryable 502 responses, while 3D remains pending. |
| Definitive failure | Persist the normalized failure code, show Roogo-controlled French/English copy, and allow the failure retry flow. Never display the provider's raw support-oriented message. |
| Collected and fulfilled | Return normal completion; historical completed monthly reservations are not re-locked based on present-day property availability. |
| Collected but reservation unconfirmed | Return [NEEDS_SUPPORT](./DOMAIN.md#payment-received-assistance-required). Retain the payment reference, explain that money was received, and offer support instead of repayment. |

Initiation, polling and callbacks share failed-payment notification dispatch. One `payments.failed` record belongs to the deposit, including accountless 3D bookings. Account notification preferences are honored; a preference/token lookup outage is retryable, not evidence of consent or an absent token. Use push when eligible tokens exist, otherwise the normalized Mobile Money payer number for SMS. After definitively rejected push attempts, the bounded retry path may use SMS. Matching SMS alerts share a 15-minute cooldown per hashed payer phone and failure code. Delivery records retain channel, outcome, phone hash and code; optional notification failures do not change the payment result. No notification inbox is added.

Listing deposits have a separate permanent consumption ledger, created by migration 072. Its property reference intentionally survives property deletion. Consumption commits or rolls back with the property insert; an already-consumed deposit can recover its existing listing but cannot create another, including after deletion. Transaction-link outages preserve that listing for idempotent repair. Historical backfill uses only surviving property/payment links and fails on conflicting evidence. See the [consumption decision](./DECISIONS.md#listing-payment-consumption-survives-property-deletion--2026-09-09).

Migration 072 also makes creation-time amenities atomic with that insert. The API supplies a sale-filtered names snapshot; the insert trigger attaches the matching amenities, so database failure rolls back both listing and consumption. Retries verify the transaction's property link and the property's transaction link, returning a retryable error if either cannot be confirmed. They neither replace amenities from changed retry input nor restore amenities removed by later edits. Initial analytics/matching-listing announcements remain best-effort and run before payment linking; payment-link retries do not re-announce old listings. Legacy writers can omit the nullable snapshot. No existing amenities are inferred or backfilled.

### Why can an alert remain uncertain rather than retry automatically?

The dispatcher records an attempt-owned, non-reclaimable sending boundary before contacting a provider. It retries outcome persistence without repeating the send. Only definite rejection permits a new attempt; provider acceptance, a lost reply or an exhausted outcome write cannot prove resending is safe. Provider acceptance is not proof of handset delivery. A crash between that boundary and the network call can leave an unsent alert uncertain; resolve it from provider evidence, never by blindly resetting its state.

Monthly reservation conflicts use the same protection independently for each customer/staff recipient. Stored conflict status reads retry eligible outstanding escalation without re-finalizing the payment. Preference opt-outs and absent tokens are recorded as skipped, while pre-send lookup errors remain retryable. Failed-payment SMS cooldown remains separate from these push-only conflict alerts.

See the [gateway decision](./DECISIONS.md#gateway-errors-preserve-the-original-deposit-for-reconciliation--2026-09-09), [notification uncertainty decision](./DECISIONS.md#notification-uncertainty-never-authorizes-a-second-send--2026-09-08), and [fulfillment decision](./DECISIONS.md#payment-recovery-preserves-historical-fulfillment-and-retries-unresolved-races--2026-09-08). Deployment gates and sandbox/device checks live in [ROADMAP.md](./ROADMAP.md#now); detailed validation evidence stays in the linked PRs.

### What must future payment changes preserve?

The originating support case was an insufficient-balance attempt, not a successful charge: a delivered provider callback means Roogo received the provider event, not that the payer received a notification. Never conflate callback delivery, collection, reservation fulfillment and customer delivery.

| Contract | Implementation boundary | Reason |
| --- | --- | --- |
| Normalized failure codes and controlled copy | `lib/payment-failures.ts`, initiation/status/callback routes | Raw provider support messages are not localized customer instructions. |
| One notification record per deposit | `lib/payment-failure-notifications.ts`, `lib/notification-deliveries.ts`, migration 070 | Initiation, polling and webhook workers can race. Accountless 3D still needs deduplication. |
| No automatic resend after uncertain provider acceptance | Durable send boundary plus Expo/AT outcome parsers | Provider acknowledgment can be lost after a send; retry persistence, not the external send. |
| Collection does not prove reservation fulfillment | `lib/property-lock-finalization.ts`, migration 071, direct/hosted support screens | Historical completed payments must not re-lock relisted properties. |
| One paid listing survives retries/deletion | `app/api/properties/route.ts`, migration 072 | Recover the original property; deleted listings must not restore a paid credit. |
| Browser returns are hints | Mobile hosted-status parser, listing draft and recovery helpers | Verify ownership/purpose and preserve a different unresolved attempt. |

Safe messages cover `INSUFFICIENT_BALANCE`, `PAYMENT_NOT_APPROVED`, `PAYMENT_IN_PROGRESS`, `PAYER_NOT_FOUND` and `PROVIDER_TEMPORARILY_UNAVAILABLE`; other codes use the generic failure copy. A failure code describes why one attempt failed, not permission to regress a completed transaction.

Notification work is best-effort and bounded: two delayed retries (2.5 and 7.5 seconds) follow the initial attempt when safely retryable. This is not an indefinitely running delivery queue. Eligibility lookup failure is retryable, opt-out suppresses the alert rather than bypassing it with SMS, and missing contact data is recorded without altering payment processing. Provider acceptance is not handset delivery. Do not promise exactly-once receipt, guaranteed arrival or automatic recovery of an uncertain send.

### Support and release limitations

- A failed charge can offer payment retry. An unverified deposit offers status reconciliation. A collected but unfulfilled reservation offers support with the existing reference.
- Investigate using deposit/transaction references, controlled failure code and delivery channel/outcome. Never log credentials or raw payer numbers; phone hashes are still sensitive identifiers, not anonymous data.
- On listing-link outages, retry submission against the original deposit. Do not delete the property or reset its consumption to force success.
- Historical deleted listing links, missing original amenities and old reservation conflicts cannot be reconstructed from present-day state; require original/provider evidence.
- **Open mobile review finding:** reopening an old successful hosted link with no original draft calls submission with incomplete fields, then persists a nondismissible paid state. Before release, recognize an already-linked property and allow missing-draft repair without discarding the deposit or authorizing another charge. Existing cold-return tests mocked submission and missed this path.
- Native-device and live-provider acceptance remain unverified. Run the agreed sandbox scenario in an explicitly configured sandbox backend; production PawaPay configuration uses live credentials, so a test number alone does not establish sandbox safety.

## How are payment migrations installed and recorded?

Before consolidation, the user confirmed on 2026-09-09 that the review-era payment migrations had not been applied. They are replaced by three files, each with one transaction and only final function definitions:

| Order | File | Responsibility | Replaces review-era payment files |
| --- | --- | --- | --- |
| 1 | `070_payment_failure_notifications_executed.sql` | Failure fields, accountless delivery records, leases, SMS cooldown and attempt-fenced failure/conflict sends | 068, 072, 073 |
| 2 | `071_atomic_property_lock_payments_executed.sql` | Reservation claims, release and atomic finalization preserving completed history | 069, 071 |
| 3 | `072_atomic_listing_payments_executed.sql` | Unique deposit index, durable consumption backfill/trigger and atomic creation amenities | 070, 074, 075 |

These are in `supabase/migrations/`. Unrelated `068_property_requests_executed.sql` and `069_property_request_deletion_safety_executed.sql` remain unchanged; they are separate features, not prerequisites introduced by payment SQL. The execution ledger records only verified migrations, not an assumed baseline for the rest of the repository.

For an environment where the chain has not run, first confirm the target/history and run these read-only preflights before 072. Both must return zero rows; conflicting evidence requires investigation, not deletion or choosing a winner:

```sql
SELECT payment_id, COUNT(*) AS properties
FROM public.properties
WHERE payment_id IS NOT NULL
GROUP BY payment_id HAVING COUNT(*) > 1;

WITH evidence AS (
  SELECT payment_id AS deposit_id, id AS property_id
  FROM public.properties WHERE payment_id IS NOT NULL
  UNION
  SELECT deposit_id, property_id FROM public.transactions
  WHERE type = 'listing_submission'
    AND deposit_id IS NOT NULL AND property_id IS NOT NULL
)
SELECT deposit_id, COUNT(DISTINCT property_id) AS properties
FROM evidence GROUP BY deposit_id HAVING COUNT(DISTINCT property_id) > 1;
```

Schedule 072 for a maintenance window: it blocks property and transaction writes while indexing/backfilling. A conflict rolls back that entire migration, not the preceding 070/071 transactions. Previously deleted listings with no surviving payment link cannot be reconstructed; reconcile from external evidence. No existing amenities are inferred from later retry input.

Apply 070 → 071 → 072, verify completion, deploy the backend, then release mobile and run the sandbox/device checks in [ROADMAP.md](./ROADMAP.md#now). Do not deploy the backend after only part of this chain. Do not run deleted review-era SQL or edit the database's migration history to force a match. If any other environment already ran an old payment migration or experimental notification workers, stop for a separate history/data reconciliation; this regrouping is intended for the confirmed unapplied rollout. Regrouping itself did not execute SQL. The subsequent authorized execution applied 070–072 to Roogo and verified their effects; see the [execution ledger](../supabase/migrations/README.md). No application deployment was performed. Because the existing database had no migration history, only these three entries were established; older migrations require a separate baseline audit before broad CLI push.

See the [consolidation decision](./DECISIONS.md#consolidate-unapplied-payment-migrations-before-first-rollout--2026-09-09).

## How do property requests connect mobile supply to staff work?

As of 2026-09-08, ROO-20 is implemented and reviewed on draft PRs [web #31](https://github.com/saliftankoano/roogo-web/pull/31) and [mobile #30](https://github.com/saliftankoano/roogo/pull/30). Shared database migrations and the mobile release have not been performed by this task. Local tests and preview deployments are not production release evidence.

An [appel à biens](./DOMAIN.md#appel-à-biens) captures a customer's property need. Operations owns the call and follow-up in **Opérations → Appels à biens** (`/admin/demandes-de-biens`); mobile agents and owners supply proposals. Staff publish a draft by selecting **Ouvert** and close it when no further proposals are needed. The backend authenticates Clerk bearer tokens and enforces identity, role, privacy and submission rules.

| Actor | Access and responsibility |
| --- | --- |
| Staff / founder | Create draft calls, publish or close them, see private customer details, review all responses and confirm commitments. |
| Agent / owner | Browse open calls and submit one property per call; retain access to their own response and its call after closure. |
| Renter / hotel / guest | No mobile Requests tab or direct access to the feed. |

Staff specify sale or monthly rental intent, location, budget and property criteria. Customer names, contacts and internal notes stay private to operations. Agent rates and payment terms must be entered explicitly before publication. A monthly-rent commission uses one month of rent; a sale commission uses the final sale price. These are separate from Roogo's listing and collection fees.

A submission records the property details, document declarations and optional private evidence. The server serializes submission with call edits/closure and checks the acknowledged call version. Retrying returns the original response, including after closure, without changing its economic snapshot. Declaring documents does not verify ownership.

Staff move responses through submitted, contacted, accepted, listed or rejected. **Retenue** confirms an agent's saved commitment, which staff can print and the agent can share. Owners have no agent commission. **Bien publié** requires a live listing belonging to the respondent and matching the response's saved transaction basis. Daily rentals cannot fulfill a monthly call. Existing listing creation, ownership review and publication gates still apply; response status alone does not perform those actions or pay anyone.

See the [decision](./DECISIONS.md#property-requests-capture-explicit-agent-terms-before-listing-follow-up--2026-09-08), [release roadmap](./ROADMAP.md#now), and [PR #31](https://github.com/saliftankoano/roogo-web/pull/31) for validation evidence.

## How do staff edit calls without losing work?

Call editing compares the original version, local draft and latest saved record. Unrelated remote changes are adopted; overlapping edits require the operator to choose saved or local values. Refresh failures preserve drafts, and another refresh cannot silently clear unresolved conflicts. Full database timestamps distinguish updates within the same millisecond.

Editor sessions own their asynchronous saves. Opening another editor is disabled while a save is pending, but browsing calls remains available and save completion respects the current selection. Failures release controls and retain the draft. Response drafts are tracked separately so saving one response, filtering, refreshing or typing during an earlier save does not erase newer or sibling work.

See the [concurrency decision](./DECISIONS.md#call-editing-preserves-intent-across-concurrent-staff-work--2026-09-08) and browser regression instructions in [PR #31](https://github.com/saliftankoano/roogo-web/pull/31).

## What survives property or account deletion?

Deleting a linked property clears its response link and records the deletion. A listed response returns to accepted while retaining its confirmed commission. Deleting a respondent clears their user reference, contact and precise location details, freeform response and staff notes, document declarations and attachment references. Deidentified economic history remains. Deleting a creator or confirmer also clears the reference instead of blocking account deletion.

Removed response files enter a private cleanup queue transactionally. The existing hourly `/api/cron/property-storage-cleanup` job retries removal. Listing media removal begins only after successful database deletion. Attachment reads use ten-minute signed URLs; refresh the call to renew them. Uploads use the private `property-request-files` bucket, are scoped to the respondent and call, and are validated before submission. Up to ten JPG, PNG, WebP or PDF attachments are allowed, each at most 10 MB.

**Known limitation:** interrupted or abandoned uploads that never become response attachments can remain unreferenced in storage. The deletion queue does not establish a general orphan-upload cleanup policy.

See the [retention decision](./DECISIONS.md#deletion-preserves-commitment-history-while-removing-private-respondent-data--2026-09-08). The [release roadmap](./ROADMAP.md#next) records migration and deployment dependencies.

## How does the Roogo hotel program work?

**Bottom line:** Roogo connects hotel supply to individual travelers and coordinated
events without becoming the hotel's internal management system. The mobile app owns
the traveler, hotel-admin, and reception workflows; this backend owns authorization,
business rules, durable booking/event state, staff review, analytics, and payouts.

A hotel admin creates or joins the hotel through a Supabase membership, publishes a
hotel listing, defines room types and counts, invites reception staff, and sets payout
defaults. Reception staff can find a paid reservation by booking code or guest phone
and move it through check-in and checkout, but admin-only actions such as room setup,
analytics, payouts, RCCM submission, event pledges, and group management remain
role-gated.

Travelers select a room type and dates, then use the existing daily request-to-confirm
flow. The hotel approves only after checking availability; the traveler pays through
PawaPay; the confirmed reservation supplies a shareable receipt and front-desk code.
The operations view summarizes 7-, 30-, or 90-day bookings, revenue, Roogo's 7% fee,
hotel net, room nights, occupancy, and payout settings. Booking chat stays scoped to
that reservation so operational messages do not become a general hotel inbox.

For coordinated travel, staff creates an event with a city, stay window, per-diem
ceiling, and code. Eligible hotels pledge a room type, a count, and optionally a lower
negotiated rate. Applying the code makes the server recheck the event window, city,
rate ceiling, and remaining per-night pledged capacity before quoting and again when
the booking is created. This prevents stale or concurrent requests from overselling
the block. Staff can then read pledged, confirmed, remaining, gross, and hotel-net
totals. Hotel groups are a separate create/join-by-code membership surface for hotels
that want a shared roster; they do not change booking ownership or payment flows.

The diagram answers who hands off each stage of an event booking. It intentionally
omits API route names and internal query details.

```mermaid
flowchart LR
    STAFF(["Staff defines event, window and per diem"]) --> PLEDGE[["Hotel pledges room type, count and rate"]]
    PLEDGE --> CODE(["Traveler applies event code"])
    CODE --> RULES{"Window, city, rate and capacity valid?"}
    RULES -->|"No"| STOP(["Quote or booking stops safely"])
    RULES -->|"Yes"| REQUEST[["Daily booking request"]]
    REQUEST --> HOTEL{"Hotel confirms availability?"}
    HOTEL -->|"Declined"| STOP
    HOTEL -->|"Approved"| PAY[("PawaPay payment")]
    PAY --> STAY[["Front desk check-in and checkout"]]
    STAY --> OPS(["Receipt, hotel net and event dashboard"])
    CHAT[["Booking-scoped chat"]] -. "supports" .-> REQUEST
    RCCM{"Staff approves RCCM evidence?"} -. "trust status" .-> PLEDGE

    classDef stage fill:#172554,stroke:#60a5fa,color:#eff6ff,stroke-width:2px;
    classDef workflow fill:#064e3b,stroke:#5eead4,color:#ecfdf5,stroke-width:3px;
    classDef decision fill:#78350f,stroke:#fbbf24,color:#fffbeb,stroke-width:3px;
    classDef external fill:#1f2937,stroke:#9ca3af,color:#f9fafb,stroke-width:2px;
    classDef success fill:#14532d,stroke:#86efac,color:#f0fdf4,stroke-width:3px;
    classDef danger fill:#7f1d1d,stroke:#fca5a5,color:#fef2f2,stroke-width:3px;

    class STAFF,CODE stage;
    class PLEDGE,REQUEST,STAY,CHAT workflow;
    class RULES,HOTEL,RCCM decision;
    class PAY external;
    class OPS success;
    class STOP danger;
```

Hotel business verification is intentionally separate from personal KYC. An admin
submits legal identity, RCCM number, optional tax number, and a private document;
staff records one approve/reject decision. Duplicate pending submissions and stale or
concurrent staff decisions are rejected, so the hotel trust state cannot silently
move backward.

See the [hotel product-boundary decision](./DECISIONS.md#hotels-use-roogo-as-a-booking-and-payment-rail-not-as-a-pms--2026-08-30)
and the hotel terms in [DOMAIN.md](./DOMAIN.md#hotel-booking-and-coordinated-travel).

## How does the no-upfront monthly listing option earn revenue?

**Bottom line:** a monthly rental can be submitted for 0 FCFA today. If Roogo
brings the renter and collects the first rent, Roogo withholds one snapshotted
success fee equal to 50% of the monthly rent shown when the listing was created.
Ongoing rent collection starts enabled when a monthly agreement becomes active
and applies its 7% fee only to rents actually collected through Roogo. The owner
can opt out from the active agreement for future unpaid installments.

Web and mobile both default monthly rentals to `free_success_fee`, show the exact
FCFA success-fee amount, and require explicit acceptance for every property,
including furnished rentals. The API independently enforces the acceptance,
rejects paid add-ons on the free path, stores one pending row in
`property_listing_fees`, and snapshots the rate, base rent, final fee, and any
referral discount together with the accepted terms version and server timestamp.
The Premium tier determines listing entitlements but creates no payment at
submission. If the deferred-fee row cannot be created, the API removes the new
property instead of leaving a published promise with no charge record.

When the first paid rent schedule is credited, `creditOwnerEarningForSchedule()`
uses the pending fee instead of the ordinary collection calculation, records the
owner's net earning, and marks that fee `collected`. A unique property/fee
constraint and the unique schedule earning prevent a callback, poll, or retry
from charging it twice. A repair guard also recognizes an existing earning if a
previous run inserted it but failed before marking the fee collected, then
finishes that state transition without charging a later schedule. Later rent
schedules use the ordinary 7% collection calculation only when payment runs
through Roogo. `rent_collection_enabled` defaults to true for new monthly
agreements and false for daily or imported offline agreements. The owner can
disable it from an active monthly bail; schedule APIs then hide in-app payment
for future unpaid rents and the payment initiation API enforces the same rule.
When the acquisition success fee is still pending, only the earliest unpaid rent
remains payable through Roogo. Re-enabling collection restores in-app payment for
all unpaid schedules. Already-paid rents are never rewritten.

Paid publication packages remain a separate alternative: payment is collected
before submission and no deferred success-fee row is created.

An agreement created from a Roogo application, or from the renter's completed
Roogo property-lock payment, preserves the pending success fee. A direct
owner-created agreement with no Roogo application and an imported offline lease
both waive it automatically in the same database transaction, because those
paths are evidence that Roogo did not source the renter.

See the [economics decision](./DECISIONS.md#monthly-listing-economics-separate-acquisition-from-default-on-rent-collection--2026-09-01).

## How does Mebo share Roogo Web without becoming the immobilier site?

**Bottom line:** the request host selects a product context before the shared
application shell renders. Mebo reuses Roogo identity, data, deployment, and API
infrastructure, while its host receives Mebo routes, metadata, navigation, and
authentication configuration instead of the immobilier experience.

`lib/site-context.ts` normalizes forwarded hosts and classifies each request as
`immobilier` or `mebo`. On `roogomebo.com`, middleware rewrites Mebo public paths
to their internal `/mebo` implementations, and the root layout configures Clerk
as a production satellite. `NavHandler` selects the Mebo header, while the
immobilier JSON-LD, navbar, acquisition-source gate, and profile-name gate stay
out of the Mebo shell. Direct `/mebo` routes remain available for local and
deployment-preview testing.

Advertiser onboarding reuses the authenticated Supabase user but stores a
separate advertiser profile and business proof. Draft profiles may be saved and
resubmitted after changes or rejection; pending, approved, and suspended states
block unsafe edits. Submission requires all business fields plus a non-rejected
proof. Proof can be an allowed external URL or a validated PDF/image uploaded
through a signed slot into the private `advertiser-proofs` bucket. The public
rollout is controlled by `ADVERTISING_ONBOARDING_ENABLED`; staff and founders
retain access for controlled testing.

```mermaid
flowchart LR
    H[Request host] --> C{Site context}
    C -->|roogobf.com| I[Immobilier shell and gates]
    C -->|roogomebo.com| M[Mebo shell and Clerk satellite]
    M --> A{Onboarding access}
    A -->|Flag enabled| P[Advertiser profile and proof]
    A -->|Staff or founder| P
    A -->|Otherwise| X[Access stopped]
    P --> D[Draft]
    D -->|Complete profile + proof| R[Pending review]
```

The diagram intentionally stops at pending review: it describes the shipped
host and advertiser-submission foundation, not a future review console or ad
delivery lifecycle.

See the [Mebo site-context decision](./DECISIONS.md#mebo-is-a-host-aware-roogo-surface-with-gated-advertiser-onboarding--2026-08-29).

## How do listing intent and admin filters compose?

**Bottom line:** every filter represents one independent property dimension,
and a listing must match all active dimensions. Keyword and location filter
descriptive data; property type filters physical shape; category separates
residential from commercial inventory; listing type separates rentals from
sales.

The admin properties API returns `listingType`, `propertyType`, and `category`.
Commercial property types map to `Business`; other supported types map to
`Residential`. The page never derives sale/rental intent from formatted prices,
and selecting `Locations` or `À vendre` compares the underlying `listingType`
directly. Missing legacy listing types retain the rental fallback used elsewhere
in the admin surface.

Expanded property surfaces use the same intent before considering rental period:

| Listing state   | Price title and unit             | Conditions and actions                                                                  |
| --------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| Sale (`vendre`) | `Prix de vente`, amount in FCFA  | No monthly/nightly suffix, caution, advance rent, rental application, or rental payment |
| Daily rental    | `Tarif par nuit`, FCFA per night | Daily-stay conditions                                                                   |
| Monthly rental  | `Prix du loyer`, FCFA per month  | Caution, advance rent, and eligible rental actions                                      |

This ordering matters for legacy data. A sale row may still contain `period =
month`, caution, or advance-rent defaults, but those fields never override
`listing_type = vendre` in the UI.

The filter card's expand/collapse animation hides overflow only while its height
is changing. Once expanded, overflow becomes visible so absolutely positioned
dropdowns can escape the animated wrapper. This is why increasing a menu's
`z-index` is not the fix for a clipped menu.

See the [listing-intent decision](./DECISIONS.md#listing-intent-stays-separate-and-controls-salerental-behavior--2026-08-29).

## How does motion work across Roogo Web?

**Bottom line:** motion is a shared orientation and feedback layer, not a
collection of page effects. Every route inherits the same timing curve and
reduced-motion behavior, while reusable navigation, onboarding, marketing, and
group-reveal components use the same compact vocabulary.

The root `AppMotionProvider` configures Framer Motion once for the entire web
application. A route change receives a short opacity transition that does not
transform the page container, so fixed dialogs and full-screen onboarding remain
anchored to the viewport. Staff pages add a brief terracotta route signal under
the stable navigation bar. Active navigation pills move with a heavily damped
spring, menus use opacity plus a few pixels of vertical travel, and buttons use a
small press response rather than hover jumps.

CSS animation and transition durations collapse under
`prefers-reduced-motion: reduce`, and Framer Motion follows the same system
preference through `MotionConfig`. The initial server-rendered frame is never
hidden; route motion begins only after hydration and only on later navigation.
Loading spinners remain because they communicate active work, but decorative
bounces, spinning success marks, and repeated progress pulses do not.

Public discovery pages use 8–12 px entrances and at most a 2 px hover offset so
search context stays spatially stable. Property galleries reserve scale changes
for opening an image, dialogs originate at 98.5% scale, and onboarding compresses
its stagger into a sub-300 ms rhythm. Payment and booking success animation is a
single confirmation stroke; it does not loop. These local rules all consume the
shared values in `lib/motion.ts` when a reusable timing is needed.

The root layout wraps every App Router branch—currently 47 page files—so legal,
auth, blog, tutorial, account, Mebo, and staff routes also inherit route feedback
and reduced-motion behavior even when they intentionally have no local animation.
The full-system audit also treats Tailwind transform utilities, modal variants,
validation shakes, image hovers, and loading indicators as part of the motion
surface; page-level Framer imports alone are not considered sufficient coverage.

`npm run motion:audit` enforces that contract across `app/` and `components/`.
It verifies the root provider and both reduced-motion layers, inventories every
`page.tsx`, and rejects oversized transforms, long one-shot entrances, overshooting
easing, decorative bounce/ping loops, and unguarded infinite motion. It runs as
`prebuild`, so a deployment build cannot silently bypass the motion baseline.

See the [motion-system decision](./DECISIONS.md#motion-explains-state-changes-instead-of-decorating-the-interface--2026-08-29).

## How does staff add ownership evidence to a review?

**Bottom line:** staff can append files to a pending ownership submission or
bootstrap one for an owner-linked sale that never completed the mobile document
step, so seller-provided and team-provided evidence reaches one approval or
rejection decision.

For an owner-linked sale whose ownership status is `unsubmitted` or `rejected`,
staff and founders can use **Ajouter un dossier** on the admin review page. The
server creates (or reuses) the property's pending submission under the real
seller, never under the staff account, and changes only the private ownership
review status. The listing gallery is not involved.

The admin review page accepts up to ten files at a time and twenty files across
the submission. PDF files are uploaded unchanged; browser-supported images and
iPhone HEIC/HEIF photos pass through the shared client image normalizer before
becoming JPEG. Each stored file is capped at 10 MB.

The browser asks a staff-only API for signed upload slots and then sends bytes
directly to the private `ownership-documents` bucket. A second staff-only call
attaches the resulting storage paths and metadata to the JSON document array.
Team-uploaded entries record `source = staff` and the uploader's Supabase user
id, including when the team bootstrapped the submission on the seller's behalf.
Both calls confirm that the submission is still pending, and attachment paths
must live under the selected seller, property, and current staff member's
namespace. Admin previews use short-lived signed read URLs; PDFs render as an
openable document card instead of being passed to the image renderer.

The approve/reject route remains the only operation that changes the review
status and the property's ownership-verification gate. Staff cannot append
evidence through this flow after a decision has been recorded.

See the
[staff evidence decision](./DECISIONS.md#staff-added-ownership-evidence-stays-on-the-pending-seller-submission--2026-08-19).

## How do we recover a hard-deleted property listing?

**Bottom line:** recover one listing without rewinding production. If no backup
from before deletion still exists, recreate the verified facts as an
`en_attente` property under the real owner, leave it private, and have staff
restore the photos and missing terms before publication.

Deletion is intentionally comprehensive: the property row is removed, linked
rows cascade, and `property_storage_cleanup_queue` purges the public
`listing/{propertyId}` folder. A successful cleanup row is therefore evidence
that the original image objects no longer exist, even if other folders remain
in the same bucket. Supabase database backups also exclude Storage object bytes.

Before reconstructing anything, staff should verify the owner account, search
the live database for a duplicate, inspect cleanup history, and separate any
surviving photos belonging to another listing. Recovered descriptions or search
indexes can help rebuild facts, but uncertain contractual fields must remain
unset until staff confirms them. The replacement receives a new property id and
starts private so it cannot be mistaken for a complete live listing.

For the 2026-08-11 Rimkieta recovery, the deleted row fell outside Supabase's
seven-day scheduled-backup window and Point-in-Time Recovery had not been
enabled. The safe path was therefore to recreate the monthly rental under the
verified owner, wait for Ablassé to upload its photos, and then use the existing
offline-lease importer to connect the renter.

See the
[targeted recovery decision](./DECISIONS.md#hard-deleted-listings-are-recreated-selectively-never-recovered-by-rolling-production-backward--2026-08-11).

## How does an existing offline lease enter Roogo?

**Bottom line:** staff imports a signed, property-specific relationship. Roogo
starts managing future rent from the first upcoming schedule, while past cash
stays visibly and financially outside the platform.

1. The property must be an available `en_ligne` monthly rental with a real owner
   or agent and no draft or active monthly agreement.
2. Staff or a founder opens **Importer un bail existant** from the property,
   owner, or renter admin view and selects the registered renter.
3. Staff enters the actual contractual rent, lease dates, caution, rent months
   already covered, offline payment details, exact commission received, and a
   required signed lease PDF or image.
4. `import_existing_monthly_lease` locks the property transactionally, creates
   one active `rental_agreement`, writes the immutable
   `rental_agreement_imports` audit row, marks covered schedules
   `payment_source = offline_import`, and leaves future schedules `upcoming` for
   the normal online flow.
5. Both users are notified and can see the imported agreement. The owner wallet
   remains unchanged because Roogo did not process the earlier money.

The operation uses an advisory transaction lock, so simultaneous submissions
cannot create two active agreements. Signed files live in the private
`rental-agreement-imports` bucket and download URLs are restricted to staff and
the agreement's two parties. The relationship is attached to this property, not
to a permanent global owner-renter pairing.

See the
[offline import decision](./DECISIONS.md#offline-leases-become-audited-roogo-relationships-not-retroactive-platform-payments--2026-08-07).

## How does a direct sale intake become an owner-linked listing?

**Bottom line:** a direct intake lets staff prepare a private, pending sale
before the owner has a Roogo account, but it does not make staff the owner and
does not weaken any publication gate.

1. Staff creates a `vendre` listing with the owner's first name, last name,
   normalized phone number, and WhatsApp availability. Those provisional
   details live privately in `sale_intakes`; `properties.agent_id` remains
   empty and no seller conversation is created.
2. The future owner creates a normal owner or agent account. Staff searches by
   name, email, phone, or WhatsApp and explicitly confirms the match. Matching
   data never links an account automatically.
3. The owner-link operation locks the intake, sets `properties.agent_id`,
   records who performed the link, and creates exactly one seller conversation
   in a single database transaction. The v1 interface does not offer
   reassignment.
4. Only after linking can the normal sale workflow continue: ownership
   documents, review, mandate delivery, the owner's own signature, and
   publication.

An unlinked sale returns the stable `sale_owner_link_required` publication
block before document and mandate checks. Public sale data never includes the
seller's account identifiers or profile fields; buyers see Roogo as the sole
interlocutor. Rentals retain their existing owner presentation.

See the
[direct intake decision](./DECISIONS.md#direct-sale-intake-is-provisional-contact-data-not-provisional-ownership--2026-08-06).

## How is the mobile app authorized to hit our API and Supabase?

**Bottom line:** the Expo app authenticates with a Clerk **Bearer JWT** (not the web
session cookie), so any route the mobile app calls has TWO independent gates it must
clear, and Supabase access rides on a **single app-wide token getter**.

1. **Middleware `isPublicRoute` (roogo-web/middleware.ts).** Clerk middleware runs on
   every request and, for non-public routes, expects a session cookie. Mobile has no
   cookie, so **every mobile-callable route must be listed in `isPublicRoute`** or the
   request is rejected before it reaches the handler. "Public" here only means "skip the
   cookie gate" — the handler still authorizes.
   - This is exactly why the founder couldn't answer support from the phone: the
     `/api/support/admin/*` routes existed and used `resolveClerkId` + CORS, but they
     weren't in `isPublicRoute`, so mobile Bearer calls never got through. Adding
     `/api/support/admin/(.*)` fixed it. **Lesson: a new mobile route isn't done until
     it's in `isPublicRoute`.**
2. **In-handler authorization.** Each such route verifies the JWT (`resolveClerkId`),
   resolves the Supabase user (`getOrSyncUserByClerkId`), and re-checks role
   (`isStaffLikeUserType`) — so exposing it to the cookie-less path never relaxes who can
   actually call it.
3. **Supabase client auth (mobile).** `lib/supabaseAuth.ts` holds ONE module-level token
   getter that supabase-js calls for RLS-gated reads + Realtime auth. It is registered
   **once at app root** (`app/_layout.tsx`), not per screen. Registering it per-hook was a
   footgun: unmounting one chat screen ran `registerSupabaseTokenGetter(null)` and
   de-authenticated any other still-mounted chat screen (silently killing its Realtime).

**Consequence:** two rules for any new mobile feature — (a) list its API routes in
`isPublicRoute` and gate them in-handler; (b) never touch the global Supabase token getter
from a screen/hook. See [decision](./DECISIONS.md#support-console-goes-mobile--read-receipts--2026-07-06).

## How do chat read receipts (✓✓ "Lu") work?

**Bottom line:** a message carries a nullable `read_at`. When the _recipient_ opens a
thread, the server stamps `read_at = now()` on the other party's un-read messages; the
_sender's_ client sees that change live over Realtime and flips the bubble from
✓ Envoyé to ✓✓ Lu.

- **Write:** `markConversationRead(convTable, msgTable, id, role)` (shared by support +
  sale via `lib/chat-read.ts`) zeroes the reader's `unread_for_*` counter and stamps
  `read_at` on messages where `sender_type != role`. Call sites gate it on
  `unread_for_<role> > 0` so an idle open/poll doesn't issue a no-op write + Realtime
  broadcast.
- **Deliver:** the chat hooks subscribe to `postgres_changes` with `event: "*"` (INSERT
  for new messages, UPDATE for the `read_at` flip) filtered by `conversation_id`, via the
  shared `useRealtimeMessages` hook. DELETE payloads carry no `new` row, so a `row?.id`
  guard skips them.
- **Render:** the shared `components/chat/ReadReceipt.tsx` shows the indicator only on the
  sender's OWN bubbles.

**Consequence / gotcha:** the live flip depends on Supabase delivering filtered UPDATE
events. If receipts only update after a manual refocus, the message tables likely need
`REPLICA IDENTITY FULL`. Cross-ref [decision](./DECISIONS.md#support-console-goes-mobile--read-receipts--2026-07-06).

## How do Visites 3D payment completions stay exactly-once?

**Bottom line:** three code paths can observe a deposit turn COMPLETED — the
PawaPay webhook, the client's 3-second status poll, and (rarely) the initiate
call itself when PawaPay completes synchronously. All three now route through one
function, `finalizeVisit3dCompletion()` in `lib/visit3d-callback.ts`, whose
conditional update (`.neq("payment_status", "completed")` + act only when a row
came back) makes the **database** the arbiter: exactly one caller wins the
transition and fires the side-effects (customer SMS, team SMS, PostHog
`visit3d_payment_completed`); the others no-op.

Why it matters: the previous read-then-check guard (`row.payment_status !==
"completed"` on a pre-fetched snapshot) was fine for sequential replays but
double-fired under the routine webhook-vs-poll race — duplicate billable SMS and
double-counted analytics. The webhook handler additionally carries a
terminal-state guard so PawaPay's at-least-once, possibly out-of-order delivery
can never regress a settled booking (only completed → refunded is allowed), and
DB lookup failures return 500 (so PawaPay retries) instead of being acknowledged
as "not found".

Related gotcha discovered in the same review: `booking_slots_view` is
`security_invoker` over an RLS deny-all table, so the **anon** Supabase key sees
zero rows through it — any consumer of that view must use the service-role
client (the view exposes only date+slot, no PII). This also means availability
was silently broken on the old Kazedra site.

## Who can read the users table? (security, 2026-10-17)

**Bottom line:** once migrations 094 and 095 have run, only the service role (our API routes) writes `users`. A signed-in Clerk user reads only their own row through `supabaseAuth`; the anon key reads none. Public owner fields (name, avatar, phone, badges on rentals, nothing on sales) come from `public_property_details`, a view that runs with its owner's rights and always returns NULL renter fields. `staff_users` is service-role only.

- **New client code** that needs the caller's own profile uses `supabaseAuth` (mobile) or an API route; never the anon `supabase` client.
- **Never add an anon policy on `users`.** Anon keeps SELECT on a few card columns only so old app embeds (`users:agent_id(...)`) return an empty owner instead of an error; with no policy that is zero rows.
- **Policies that look up "my users row"** (support chat, sale chat, listing config, advertiser profiles) keep working because the own row stays visible to `authenticated`.
- **Order:** 094 is safe at any time. 095 waits for the mobile OTA; app binaries on an older runtime lose profile load, adding favourites, "Mes propriétés" and the listing edit screen until they update. Check with `node scripts/check-users-exposure.mjs` (GET only, prints counts and column names).
- [Decision](./DECISIONS.md#the-users-table-is-private-public-owner-fields-come-only-from-the-listing-view-security--2026-10-17).

## How do app updates reach users? (OTA vs store builds, and runtimeVersion)

**Bottom line:** the app updates through two pipes. OTA (expo-updates) pushes
new JavaScript silently on next launch: instant, no review, our default for
fixes. Store builds (EAS) ship the native binary: slow, reviewed, and the user
must act. `runtimeVersion` is the compatibility contract between them: an OTA
bundle is only delivered to binaries carrying the SAME runtime label.

Why it matters: adding native code (like v1.17.0's audio recorder and document
picker) means old binaries physically lack functions the new JS calls. Bumping
`runtimeVersion` protects them from receiving JS that would crash, but the
price is that everyone on the old binary is silently cut off from all future
OTAs until they install the store update, and nothing from Apple or Google
reliably tells them to. That gap is closed by the in-app update banner, fed by
`/api/app-version` (bumped only when a release is live in stores).

Rules of thumb: JS-only change, keep the runtime and ship OTA. Native change,
bump `version` + `runtimeVersion` together per
`roogo/docs/PRODUCTION_BUILD_CHECKLIST.md`, build both platforms, then bump
the endpoint after approval. Never bump the runtime for an OTA-only release.
(Decision: [update delivery policy](./DECISIONS.md#update-delivery-policy-ota-for-js-native-builds-when-needed--2026-07-09).)

## Why does migration 045 exist if the Visites 3D `bookings` table already lives in our database?

**Bottom line:** the kazedra site and roogo-web have always pointed at the **same
Supabase project**, so when the 3D-visits service migrated to Roogo (2026-07-06) the
`bookings` table, its indexes, the `booking_slots_view` and every past booking were
already "ours" — no data moved. Migration `045_visites_3d_bookings_executed.sql` still needs
to be run once, for two reasons:

1. **One real change:** `drop column with_roogo` — the old dual-pricing flag
   (10 000 / 7 500 FCFA with the 25% Roogo discount) is retired in favor of the
   single 15 000 FCFA/pièce rate. The code no longer reads or writes that column;
   until 045 runs, it just sits there as dead weight (harmless, because it has a
   default).
2. **Baseline/bookkeeping:** everything else in 045 is written idempotently
   (`create table if not exists`, `create index if not exists`, `create or replace
view`) and is a **no-op against the live DB**. Its purpose is that roogo-web's
   migration folder now fully describes a table it owns — a fresh environment (or a
   future migration audit) can rebuild the schema from this repo alone, without
   digging up the deleted kazedra migrations.

So: not urgent, nothing breaks before it runs, but run it once so the schema and the
code agree. (Decision context: [Visites 3D move under the Roogo brand](./DECISIONS.md#visites-3d-move-under-the-roogo-brand--2026-07-06).)

## What are the AT\_\* / TEAM_PHONE env vars for (Visites 3D)?

**Bottom line:** they power the confirmation SMS sent after a 3D-visit booking is
paid — Africa's Talking is the SMS provider (chosen for Onatel/Orange/Telecel
coverage in Burkina).

- `AT_USERNAME` / `AT_API_KEY` — Africa's Talking credentials. `sandbox` as the
  username = test mode, no real SMS, no cost; the live app username sends real,
  billed SMS (~0.05 USD each, 2 per booking).
- `AT_SENDER_ID` — optional alphanumeric name shown as the SMS sender (e.g.
  "ROOGO"); must be approved by Africa's Talking, otherwise a shared shortcode is
  used. Leave empty in sandbox.
- `TEAM_PHONE` — the `+226XXXXXXXX` number that receives the internal "Nouvelle
  reservation 3D: …" alert so the team knows to schedule the shoot.

If these are missing in production, **bookings and payments still succeed** — the
SMS helper (`lib/africastalking.ts`) catches its own errors and just logs them; only
the notifications are skipped. That's why adding them to Vercel is an ops step, not
a blocker. Full flow reference: [visites-3d.md](./visites-3d.md).

## How does Roogo Sell (the broker model) work?

**Bottom line:** Roogo is the sole intermediary between sellers and buyers — they
never talk to each other. Since economics v2 (2026-07-09, migration 050), Roogo
earns a **disclosed commission**: a base percentage (default 10%) of the seller's
desired price, plus a share (default 50%) of any surplus when the sale closes above
that price. The old buy-low/sell-high spread model is retired.

**Economics (v2):** seller nets `D × (1 − base%) + (P − D) × (1 − split)` where `D`
is their desired price and `P` the final sale price. Example at 10%/50%: desired 3M,
sold 10M → seller walks away with 6.2M, Roogo earns 3.8M. The percentages are
platform settings on `listing_config` (founder-editable in `/admin/parametres`,
read live by web and mobile) and are **snapshotted onto each mandate at send time**,
so changing a setting never rewrites an agreed mandate. `sale_notary_price_basis`
records which amount the notary act uses (`desired` for now; switchable). Notary
fees are paid by Roogo. See
[the decision](./DECISIONS.md#roogo-sell-economics-v2-base-commission--5050-surplus-split--2026-07-09).

**Seller flow:**

1. Owner submits a `vendre` listing with the **amount they want to receive**
   (their desired price), plus ownership proof — primarily the **PUH** (_Permis
   Urbain d'Habiter_). The commission model is disclosed before they submit.
2. A seller↔Roogo chat (one thread per property) opens automatically. Roogo reviews
   the ownership docs.
3. Roogo sends a **mandate** (desired price + commission percentages + an
   exclusivity period). The owner **signs it in-app** (tap-to-confirm + typed name).
   Signing publishes the listing at the desired price + 30% (since 2026-10-11).
4. Only then is the listing publishable and photographed by Roogo. Staff then move
   the public price (`properties.price`) within the ladder below. Since 2026-10-11
   the owner sees the listing price and the payout table on the mandate.

**Price ladder and who decides (sales only, 2026-10-17):** a `vendre` listing is
published at owner price `D` + 30% (`publishedListingPrice`, on creation and again
when the mandate is signed); `D` stays private (`sale_asking_prices`, then the
mandate's `desired_price`). Rungs: +30% listing, +20% target (owner receives exactly
`D`), +15% reference (display only), +10% team floor. `PATCH /api/properties/[id]`
runs `checkPublicSalePriceChange` (an unchanged price is not a change):

| New public price | Who | Confirmations (`priceConfirmations`) |
| --- | --- | --- |
| >= `ceil(D × 1.10)` | any staff | none |
| below +10%, >= `D` | founder or Directeur (`staff_level = 'director'`) | Directeur: `discussed_with_salif` |
| below `D` | founder or Directeur | `owner_agreed`, plus `discussed_with_salif` for the Directeur |

Other staff get 403. Missing confirmations get 422 with
`code: "sale_price_confirmation_required"` and `required`, and the admin listing
page (checkboxes) and the app (confirmation dialogs) ask for them. An allowed price
below +10% first writes a row in `sale_price_approvals` (097, service role only,
holds `D`), then saves the price; the row is removed if the save fails, and the
change is refused if the row cannot be written (so nothing below +10% saves before
097 runs). PostHog gets `sale_price_founder_approved_below_team_floor` without `D`.
The staff ladder (`GET /api/properties/[id]/sale-ladder`, admin listing and app)
lists the last 10 approvals: who, level, when, price, markup, confirmations.

Owners see only `ownerPayoutScenarios`: what they receive at +30%, +20%, +15%,
+10% and at `D`, stored on the mandate card as `payout_table` without Roogo's
commission per row. Displayed team floors are rounded UP to 50,000 FCFA. Rentals
(`louer`, daily or monthly) skip all of this (`saleLadderApplies`). The ladder
percentages live in `sale_economics_config` (075) and are snapshotted on each
mandate; the 075 column `team_floor_markup_pct` holds the +15% reference and
`hard_floor_markup_pct` the +10% team floor.

**Buyer flow:**

1. Buyer browses listed properties and opens a buyer↔Roogo chat (not the owner).
2. Roogo schedules **visits** (Roogo-run; the owner need not attend).
3. When there's a deal, Roogo schedules a **notary meeting at its office**. Background
   checks, signing, and payment happen offline there.
4. Visits and notary meetings appear as **cards in the thread + push notifications**,
   with a Google Maps link to the office.

## What gates a sale from going live — and how is that different from identity verification?

**Bottom line:** There are two independent things called "verification," and only one
of them gates publishing.

- **Identity (KYC) verification** — the owner's national ID. As of 2026-07-06 this is
  **optional** and never blocks posting; it only earns the trust badge. Enforced
  nowhere as a gate. (See the [decision](./DECISIONS.md#identity-kyc-becomes-optional--2026-07-06).)
- **Ownership verification** — the property documents (PUH etc.), reviewed per
  listing. For a **sale**, the listing cannot go `en_ligne` until
  `ownership_verification_status = 'approved'`.
- **Signed mandate** — a sale also cannot go `en_ligne` until a `property_mandates`
  row for it is `status = 'signed'`.

Both sale gates live in `app/api/properties/[id]/status/route.ts` and apply only to
`listing_type = 'vendre'`. Rentals have neither; they're gated only by staff
moderation (and any payment/tier requirements).

The practical consequence: an owner can post a property without proving who they are,
but Roogo will not publish a sale — and cannot take its spread — until it has verified
the property's ownership and the owner has signed the mandate.

## How is the principal photo saved?

The first photo in the saved gallery is the principal photo. Dragging a handle or using a previous/next arrow saves the entire permutation with the editor's starting order. Authentication and staff/founder or property-ownership checks happen before a server-only transaction locks the property and gallery. It validates every URL, rejects stale edits, and updates positions and the single principal flag together. A retry of an already saved order succeeds without another change. Invalid or failed writes leave the previous order intact.

Both listing views expose ordered `images` and computed `primary_image` from the first position. Existing public redaction, grants and security options are preserved. No `properties.primary_image` storage column exists or is needed. Uploads append without stealing the cover; deleting a photo resequences the gallery and promotes the first remaining photo. The legacy mobile principal-photo endpoint moves its selected photo to the front while retaining the others' relative order.

The web control displays pending and saved states, blocks overlapping mutations, restores the previous arrangement on failure, and tells the user to reload on a stale-order conflict. Professional-photo approval and publication remain separate actions.

The original alert came from writing to a nonexistent column after image flags had already committed. The transaction and shared read views eliminate that diagnosed partial-save path. Regression checks cover persistence, rollback, stale edits, authorization and view security; these safeguards cannot guarantee that authentication, networks or database services never fail.

See [ordered-gallery decision](./DECISIONS.md#gallery-order-determines-the-principal-photo--2026-10-05) and [photo principale](./DOMAIN.md#photo-principale). Run `npm run test:primary-photo`; optional concurrency checks require `ROOGO_PHOTO_ORDER_TEST_CONTAINER` pointing to a disposable local Postgres fixture, never production.

## How does a Studio video get made and stored?

The editor sends the project, the photo order, the voice position, the outro text and (optionally) a music track. The server rebuilds everything that matters from its own records: it accepts only the listing's own photos, takes the newest voice-over of the project, and always takes the price from the listing, whatever the browser sends. It reserves the price from the person's **video** budget, writes a self-contained HyperFrames page from the template, and submits it to HeyGen. Pressing the priced button is the confirmation.

```mermaid
sequenceDiagram
  participant E as Éditeur vidéo
  participant S as roogo-web
  participant H as HeyGen (HyperFrames)
  participant B as Storage (content-studio)
  E->>S: Créer la vidéo (photos, voice position, outro, music)
  S->>S: rebuild from records, reserve video budget
  S->>H: render the template page
  loop every 4 s
    E->>S: poll the render
    S->>H: status
  end
  S->>S: first poll that sees it finished claims it
  S->>H: download the MP4
  S->>S: re-encode (ffmpeg, about 1/7 of the size)
  S->>B: store, then add the video to the project
```

The diagram leaves out failures: a render that fails or takes more than 15 minutes is marked failed and stops counting against the budget. Only one poll can claim a finished render, so a video is saved once even with several tabs open. The page polls; if nobody has the editor open, the render is saved the next time someone opens it.

- **Templates:** **Visite POV** lasts voice start + voice length + 1.4 s; the voice starts 0.4 s in and staff can slide it up to 6 s. **Fin seule** is the 6 s outro alone, without voice or watermark. **Présentateur dans le coin** (not deployed yet) lasts the presenter clip + 0.7 s + the 6 s outro: the filmed walkthrough plays silent in full frame (looped if shorter, cut if longer), the presenter plays with sound in a corner window. Its two clips come from the field uploads (`studio_field_media`), must be ready videos of the same property, and are fetched by HeyGen through `signedFieldMediaUrl`. See the [decision](./DECISIONS.md#studio-template-présentateur-dans-le-coin--2026-10-12).
- **Price:** $0.12 per rendered minute, rounded up to the cent. Videos have their own monthly cap (`STUDIO_DEFAULT_VIDEO_CAP_USD`, or the person's `monthly_video_cap_usd`), counted apart from voices, images, subtitles and music.
- **Storage:** Supabase refuses files over 50 MB whatever the bucket setting, so every render is re-encoded before storing (85 MB → 12.9 MB on a real render); a file still over 48 MB fails with a message. The ffmpeg binary ships with the save route (`outputFileTracingIncludes`). See the [decision](./DECISIONS.md#studio-videos-are-re-encoded-before-storage--2026-10-11).
- **Download:** the project page and the editor offer the newest video with a signed link that names the file like a title (`Roogo - <bien> - Visite du bien.mp4` or `- Fin de vidéo.mp4`).

Why templates and separate budgets: [decision](./DECISIONS.md#studio-videos-are-built-from-listing-photos-and-templates--2026-10-10).

## How does music play in a Studio video?

The music is one audio track under the whole video, from the first frame to the last. Its level follows a curve written into the page as a HyperFrames volume lane: it fades in, sits at 0.32 while nobody speaks, drops to 0.08 about 0.3 s before the voice and rises again just after it, then fades out over the last 1.6 s. "Fin seule" has no voice, so the song stays up the whole time. The editor preview plays the music with the same curve (`musicEnvelope`, `musicLevelAt`), so what staff hear is what renders.

Tracks live in `studio_music_tracks` and the `content-studio` bucket. **Library** tracks were uploaded once from the vault by `scripts/upload-studio-music.mjs`; **generated** tracks come from fal Lyria 3 Pro through the same job pipeline as images (ledger kind `music`, paid from the voices-and-images budget) and are shared with the whole team. The chosen track is remembered per project in the browser and sent with the render; a track that no longer exists is refused by the server. Lyria has no "instrumental" switch, so the prompt always asks for no vocals in several ways. See the [decision](./DECISIONS.md#studio-music-roogo-tracks-and-generated-instrumentals-only--2026-10-11).

## How does the Studio make the voice say words correctly?

The visible script stays in correct French; a separate "texte envoyé à la voix" is produced by deterministic rules and shown before paying.

1. The script-writing model receives the team glossary and the built-in respellings, so it spells names the way the rules expect.
2. The rules replace glossary words regardless of case, accents, plurals and hyphen variants (a longer word containing the term is left alone), then apply built-in respellings: Roogo → "Rohgo", Ouagadougou → "Waga", roogobf.com → "Rohgo bé èf point com".
3. Prices become words with "de" after millions ("cinquante millions de francs CFA"), phone numbers are read in pairs, years in full. Only the rules touch numbers, never a model.

Why: [decision](./DECISIONS.md#studio-pronunciation-the-glossary-guides-the-writer-rules-make-the-speech--2026-10-10).

## How do field photos and videos reach the shared Drive?

Staff open a property's project in the Studio and drop the visit's files in **Médias du terrain**. Each file goes from the browser straight to the shared Google Drive "Roogo", in `Vente` (sales) or `Location` (everything else), then a folder named `Quartier - Nom du propriétaire`. The owner name is the seller from a direct sale intake, else the account that listed the property. An existing folder with the same name is reused even if accents, case or dash style differ (oldest first). Missing parts become `Sans quartier` or `Propriétaire inconnu`.

```mermaid
sequenceDiagram
  participant B as Studio (browser)
  participant S as roogo-web
  participant G as Google Drive
  B->>S: POST /api/admin/studio/media (name, size, type, duration)
  S->>G: find or create Vente|Location / Quartier - Propriétaire
  S->>G: open a resumable session (Origin = the Studio's origin)
  S-->>B: session address, row "uploading"
  loop 16 MiB chunks
    B->>G: PUT bytes (Content-Range)
  end
  B->>S: POST /media/[id]/finalize
  S->>G: session status, then file id, folder and size
  S-->>B: row "ready"
```

- **Why direct:** Supabase refuses files over 50 MB and Vercel request bodies stop near 4.5 MB, while phone footage is 100 MB to 1 GB. The bytes never pass through Supabase; they pass through Vercel only in the fallback. Limit 5 GB per file.
- **Fallback:** if Google refuses the browser before the first chunk (CORS, network filter), the same session is fed in 4 MiB chunks through `PUT /api/admin/studio/media/[id]/chunk`. It is slower, but it works.
- **Resume:** after a network error the browser asks `GET /api/admin/studio/media/[id]` how many bytes Google kept and continues from there. After a reload, dropping the same file again (same person, property, name and size, within 6 days) resumes the old session.
- **Ready means checked:** finalize asks Drive itself. A file is ready only if the session is complete and the file exists in the chosen folder, not in the bin, at exactly the announced size. Otherwise the row is `failed` with the reason.
- **Index:** `studio_field_media` (migration 086): property, kind, name, type, size, duration, Drive file and folder ids, status, uploader. The Drive session address is kept only while uploading. Service role only.
- **Video length:** `duration_seconds` is set at finalize from Drive's `videoMediaMetadata.durationMillis`, else from the browser's own reading of the file before upload. If both are missing (Drive still processing, a codec the browser cannot read), the list route asks Drive again, five rows per call, until it is filled.
- **Originals are kept as shot** (HEIC, MOV): Drive is the archive. The panel shows Drive's preview images.

### Using the clips in other features (shared contract)

- `GET /api/admin/studio/media?propertyId=<uuid>` (staff) returns `{ media: [{ id, kind, fileName, mimeType, sizeBytes, durationSeconds, status, driveFileId, createdAt, driveUrl, folderPath, error }], folderUrl, driveConfigured }`, newest first.
- `signedFieldMediaUrl(mediaId, ttlSeconds?)` in `lib/studio/field-media.ts` returns `https://www.roogobf.com/api/admin/studio/media/<id>/stream?exp=<unix>&token=<hmac>`. It is valid 3 hours by default and 24 hours at most, for that file only. It throws if the file is not `ready`.
- `GET|HEAD /api/admin/studio/media/[id]/stream` streams the Drive file with Range support (206). It opens with a valid token, without a session (public in `middleware.ts`), or with a staff session. `?thumb=1` returns Drive's preview image. Long files pass through a Vercel function (max 300 s) and count as Vercel data transfer.
- The token is HMAC-SHA256 over `studio-field-media:v1:<id>:<exp>` with `STUDIO_MEDIA_URL_SECRET`, or a key derived from `SUPABASE_SERVICE_ROLE_KEY` when that is not set. Changing the secret revokes every link. The base URL is `STUDIO_PUBLIC_BASE_URL`, else `NEXT_PUBLIC_APP_URL`, else `https://www.roogobf.com`.

### Setup (Salif, once)

1. **Google Cloud project.** At [console.cloud.google.com](https://console.cloud.google.com), signed in with the Roogo Workspace account, create a project (or pick one), for example `roogo-studio`.
2. **Enable the Drive API.** APIs & Services, Library, search "Google Drive API", Enable.
3. **Create the service account.** IAM & Admin, Service Accounts, Create service account: name `roogo-studio-drive`, no roles needed, Done. Copy its address (`roogo-studio-drive@<project>.iam.gserviceaccount.com`).
4. **Create a key.** Open the service account, Keys, Add key, Create new key, JSON. A file downloads. Keep it private; never put it in the vault or a repository.
   - If Workspace blocks key creation (policy `iam.disableServiceAccountKeyCreation`), an organisation admin must allow it for this project under IAM & Admin, Organization policies.
5. **Add it to the shared drive.** In Google Drive, the shared drive "Roogo", Manage members, paste the service account address, role **Content manager**, uncheck "Notify", Send. If sharing outside the domain is blocked, allow it for this address in the Admin console (Apps, Google Workspace, Drive and Docs, Sharing settings).
6. **Vercel environment variables** (Production, and Preview if you test there):
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `client_email` from the JSON.
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` = `private_key` from the JSON, pasted whole, including `-----BEGIN PRIVATE KEY-----`. Both real line breaks and `\n` work.
   - Or instead of those two: `GOOGLE_SERVICE_ACCOUNT_JSON` = the whole key file (this is what production has).
   - `ROOGO_SHARED_DRIVE_ID` = `0AMeNoBD5FUIfUk9PVA`.
   - `STUDIO_MEDIA_URL_SECRET` (recommended) = a long random value, for example from `openssl rand -base64 48`.
   - Optional: `STUDIO_PUBLIC_BASE_URL` if stream links must point somewhere other than `https://www.roogobf.com`.
7. **Migration 086** (`supabase/migrations/086_studio_field_media_executed.sql`) has run on Roogo (recorded 2026-10-17); redeploy after the env vars are set.
8. **Check:** upload one photo and one video of about 200 MB from the Studio, confirm they appear in `Biens/Location/<Quartier - Propriétaire>` in the Drive, that the panel shows them, and that the browser console has no "switching to the relay" warning (that warning means the direct CORS path was refused).

Why: [decision](./DECISIONS.md#studio-field-media-go-straight-to-the-shared-drive--2026-10-12).

## How does the field visit sheet (Fiche de visite) work?

Staff open it from a listing (`Fiche de visite` button on `/admin/annonces/[id]`, which goes to `/admin/fiche-visite?bien=<id>`) or from the briefing (`Commencer une fiche de visite`, which asks for the listing first). The property, quartier, owner and type come from the listing. A sheet continues on another device at `/admin/fiche-visite/<id>`.

- **Screens:** Infos, 1 Avant de partir, 2 Départ du bureau, 3 Sur place, 4 Départ du site, 5 Retour au bureau, Tournage terminé. The rules (checklist wording, what each step needs, business days, tasks, folder name, follow-up status) live in `lib/field-visits/core.ts` and are tested in `core.test.mjs`. On a phone the sheet is a full-screen app; from 1024 px it sits in the admin with a stepper (completed steps clickable).
- **Team:** one or two people (enforced in the UI, the API and the table). The first is "personne 1".
- **Times:** every tick stores the device time (ISO, shown as Ouagadougou time, which is UTC). The four time buttons fill `departed_office_at`, `arrived_at`, `left_site_at`, `returned_at`. The in-app notice is read from `field_visits` by the briefing (`fieldNotices` in the briefing payload); nothing is sent outside Roogo. "Aussi sur WhatsApp" only opens a `wa.me` share link.
- **Sur place:** checklist only. Browser geolocation (latitude, longitude, accuracy); if refused or impossible, "Continuer sans position" records why. Three ticks within 20 seconds show the red notice and store its time in `batch_warnings`.
- **Uploads (step 5 only):** each deliverable button is a file picker with `multiple`; files go through the Studio field-media upload (`POST /api/admin/studio/media` with `fieldVisitId` and `deliverable`), straight from the browser to Drive in `Biens / Vente|Location / <CODE> <titre> / <type>`. Scan 3D and Insta360 trips may be `.insv`/`.insp`, stored with kind `file` and hidden from the Studio's media list. Finalize refreshes the sheet's `uploads` summary.
- **Autosave:** every change goes to `localStorage` (`roogo-fiche-visite:<property id>`) at once and to `PUT /api/admin/field-visits/<id>` after 0.7 s (nothing reaches the server before "Commencer"). The device picks the sheet id, so a sheet begun without network keeps its id. Offline, the pill says "Hors connexion · gardé sur le téléphone" and the sheet syncs on `online`. The newest device change wins; an older one gets 409 and the stored version. Reopening a listing with an unfinished sheet offers "Fiche en cours retrouvée" (Reprendre, or Recommencer, which marks the old sheet `abandonne`).
- **Withdrawing a sheet (founder):** « Retirer cette fiche » on Visites terrain sends `PATCH /api/admin/field-visits/<id> {action: "withdraw"}`, which marks an `en_cours` or `termine` sheet `abandonne` and clears `completed_at` (090 ties it to `termine`). `loadTaskRows` in `lib/team-tasks/server.ts` then hides every `staff_tasks` row whose `field_visit_id` points to an abandoned sheet, so its montage tasks leave briefings, counts and the team board. Rows, files and the Drive folder stay.
- **Finishing:** `POST /api/admin/field-visits/<id>/complete` re-checks every step on the server, creates the six `staff_tasks` (kind `manuel`, linked to the property and to the sheet, owner chosen on the last screen, due on the next business day, 12:00 and 17:00 where the canvas says so) and stores `deliverable_dates`. Each task has `source_key = field-visit:<id>:t1..t6`; the unique index from 089 makes a second call create nothing. Burkina public holidays are not handled yet.
- **Follow-up:** `/admin/studio/visites` (Directeur and Fondateur, `isDirectorOrFounder`) lists sheets with a status (en cours, sur place depuis…, fichiers manquants, tournage terminé, livrables x sur 5) and shows the four phases, the four times, every tick time, the Drive contents and the deliverables.
- **Data:** `field_visits` (migration 090, after 086): RLS on, no policies, service role through the admin routes; plus `studio_field_media.field_visit_id`/`deliverable` and `staff_tasks.field_visit_id`. Same Google service account env vars as the field media (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `ROOGO_SHARED_DRIVE_ID`).

Why: [decision](./DECISIONS.md#the-field-visit-sheet-moves-into-the-app--2026-10-15).

## Why do old page addresses keep working?

Renamed pages answer their old address with a permanent redirect, query string included (`next.config.ts`). Old admin addresses take two hops (to a trailing slash, then the page) until [#59](https://github.com/saliftankoano/roogo-web/pull/59) is merged, then one. The old payment return `/payments/callback` is the exception: it serves the same page as `/paiements/retour` directly, so a payment started before the rename returns without an extra hop. New payments return to `/paiements/retour` because the server builds the return address (`PAWAPAY_PAYMENTPAGE_RETURN_URL` is not set in production). The mobile app only calls `/api/` and opens listing and terms pages, none of which were renamed. See the [decision](./DECISIONS.md#page-addresses-are-french-old-ones-redirect-except-the-payment-return--2026-10-11).

## How does staff access work, and where is it written down?

Three things decide what a staff member can do.

- **Account type (Clerk `publicMetadata.userType`).** `middleware.ts` requires a session for `/admin`; `app/admin/layout.tsx` sends anyone who is not `staff`, `founder` or `admin` (`isStaffLikeUserType`) back to `/`. A few checks still look at `founder` alone: answering demandes, the founder-only title change on L'équipe, and in the Studio editing or deleting someone else's glossary entry and withdrawing someone else's voice.
- **Staff level (`users.staff_level`, mirrored in Clerk `staffLevel`, migration 089_staff_levels).** `lib/staff-access.ts` holds the capability matrix used by the admin routes, page guards and the menu (see [staff access levels](#how-do-staff-access-levels-work)). Staff without a level act as `legacy` (the access from before levels) until `STAFF_LEVELS_ENFORCED=true`, then as `advisor`.
- **Title in the team tools.** The title IS the level: `titleFromStaffLevel` maps `director`, `assistant`, `advisor`, `intern` to Directeur, Assistant(e) commercial(e), Conseiller(ère), Stagiaire, and `levelFor` treats no level as Conseiller(ère). It drives `assignmentKind` (who may give a task to whom; a Directeur reaches the founder only through a demande) and `isDirectorOrFounder` (L'équipe board, assigning unowned automatic items, Visites terrain follow-up). The founder's title change on the board calls `setMemberLevel`. The `staff_titles` table of `089_staff_tasks_executed.sql` is not read any more.
- **Joining.** By invitation from `/admin/acces/niveaux` (tab « Niveaux et invitations » of « Accès »). The shared code (`/api/auth/verify-staff-code`, `STAFF_REGISTRATION_SECRET`) still works but only creates the `intern` level.

The page « Accès » (`/admin/acces`, linked as « Accès » in Pilotage and from L'équipe) has two tabs: « Qui peut faire quoi » (`/admin/acces`, the default, readable by every staff member) and « Niveaux et invitations » (`/admin/acces/niveaux`, only with `team.manage`; `/admin/equipe/niveaux` redirects there). The first tab renders `lib/access/matrix.ts`: every action with Oui / Lecture / Non per level, how it is enforced (server, page, menu) and the files, the note on unleveled staff (it reads `STAFF_LEVELS_ENFORCED` at render), plus the vault proposal items that are not enforced yet. `lib/access/matrix.test.mjs` compares it with `assignmentKind`, `isDirectorOrFounder`, `LEVEL_LABELS`, `STAFF_CAPABILITY_MATRIX` (every rule that names a capability must match it level by level and cite a file that uses it), the legacy level, the menu, the Studio caps per level and the staff code route, and fails when a new route under `app/api/admin` or `app/api/support/admin` is not described. When you change a permission, change the matrix in the same commit.

Why: [decision](./DECISIONS.md#the-access-page-is-generated-from-one-matrix-file--2026-10-16).

## How do team goals, call notes and demande answers work?

Goals live in `team_goals` (migration 091); `lib/team-goals/core.ts` holds the pure rules (period windows, countdown, pace and status, evidence shaping, permissions, input checks) and `lib/team-goals/server.ts` loads each metric once per request: users from `users` (paged, staff and test accounts excluded), contracts from `rental_agreements` with status `active`, listings from `properties.published_at` inside the window (pending ones shown, not counted), sales from listings with status `vendu` and `sold_at` inside the window (migration 093; any property type, test listings excluded), followers from `team_goal_readings` (`source` `automatique` from the nightly Meta reading, or `manuel` with a screenshot in the private bucket `team-goal-proofs`, served as signed links). A `recurring_month` goal is measured on the current month; past months are history rows. Levers (`team_goal_levers`) count this team week's ticks (`team_goal_lever_ticks`) plus done tasks with that `lever_id`. Tasks can carry `goal_id`/`lever_id` (« Pour : … »). API: `/api/admin/goals` (+ `[id]`, `levers`, `levers/[id]`, `readings`).

Marking a listing sold: the status menu on the admin listing page offers « Vendu » for sale listings to the Directeur and the Fondateur; the confirmation asks for the notary signing date and the price. `PATCH /api/properties/[id]/status` with `{ status: 'vendu', soldAt, soldPrice }` checks the rules in `soldTransition` (`lib/property-status.ts`) and writes `sold_at`, `sold_price`, `sold_by`; leaving `vendu` clears them. Public browse and `/proprietes/[slug]` only show `en_ligne` listings, so a sold listing disappears from the site. Open sale chats or visit requests on it are not closed automatically.

Call notes (migration 092) are in `staff_call_notes`, written by `/api/admin/call-notes` through `lib/team-tasks/calls-server.ts`, which also finds the number to call (task, property request contact, visit buyer, listing owner) and the previous calls on the same subject. Demande answers use new `staff_tasks` columns (`decision`, `snoozed_until`, `thread_started_at`, `settled_at`, `sender_seen_at`, `owner_seen_at`) and `staff_task_messages`; the state machine and who may act are `demandeState` and `demandeActionError` in `lib/team-tasks/core.ts`. Approving or settling closes the row (`status = fait`).

Env vars for the automatic follower readings (server only, never `NEXT_PUBLIC_`): `META_GRAPH_TOKEN` (Meta Graph token that can read the page and the Instagram account; sent in the Authorization header, never logged), `META_PAGE_ID` (Roogo Burkina page, `1046356035218080`), `META_IG_ACCOUNT_ID` (`17841436630471998`). Read by `/api/cron/social-followers` (daily 02:00 UTC, `CRON_SECRET`); without the token it returns `{ skipped: "no token" }`.

## How do end-of-day reports and absences work? (« Fin de journée », 2026-10-19)

- **Mon espace.** `EndOfDayCard` (`components/admin/team/DayReport.tsx`) shows a quiet line before 15:00 Ouagadougou, opens the form from 15:00 and is highlighted from 17:30 (the in-app reminder; nothing is sent by WhatsApp or SMS). The window is `eodWindow` in `lib/team-tasks/day-reports.ts` (UTC getters: Ouagadougou is UTC all year); the card ticks every 30 s from the server time, so it turns on without a reload. The form has four parts and an absence switch: « Fait aujourd’hui » (the tasks ticked today, read-only, plus free text), « Mes actions pour demain » (1 to 5 one-line actions), « Ce qui n’a pas marché aujourd’hui », « Comment on pourrait faire mieux », and « J’étais absent(e) aujourd’hui » with a required category (maladie, urgence familiale, congé, autre) and an optional note (« Visible seulement par le Directeur et le Fondateur. N’écrivez pas de détails médicaux. »).
- **Actions become tasks.** `POST /api/admin/day-reports` (`submitMyReport` in `lib/team-tasks/day-reports-server.ts`) inserts one `staff_tasks` row per new action (kind `manuel`, owner and creator the person, due the next working day, note « Depuis mon compte rendu du … »), so they appear in « Demain » at once. The task ids are kept in `staff_day_reports.tomorrow_actions`; `staff_tasks` is not altered. Editing the same day (`planActions`) keeps existing tasks, creates new ones and deletes the tasks of removed lines while they are still « à faire ». One row per person per day (`UNIQUE (user_id, report_date)`).
- **L’équipe.** `GET /api/admin/day-reports/team` (Directeur and Fondateur, `isDirectorOrFounder`) gives each column a chip (`reportChip`: « Compte rendu envoyé », « Pas encore envoyé », « Absent (catégorie) »; an absence wins), the report behind it (`ReportDrawer`), and « Comptes rendus de la semaine »: reports sent Monday to Friday out of 5, absences by category, and the week’s improvement ideas in one list. The founder has no chip unless he wrote a report.
- **Absences declared for someone.** « Déclarer une absence » (`POST /api/admin/day-reports/absences`, Directeur and Fondateur, `canDeclareAbsence`; nobody declares for the founder) upserts the day’s row with `absent`, the category, the note and `declared_by`. `{ clear: true }` takes it back. If the person later sends their report and keeps the absence, the declared note and `declared_by` stay.
- **Who reads what.** `canReadReport`: Conseiller(ère), Assistant(e) and Stagiaire only their own; Directeur and Fondateur everyone. `canSeeAbsenceNote`: Directeur and Fondateur always; the person only when they wrote the note themselves. `toReportView` removes what the viewer may not read before anything leaves the server.
- **Data.** `staff_day_reports` (migration `099_staff_day_reports.sql`, not run yet): RLS on, no policies, anon and authenticated revoked, service role only. Before it runs, reads return `ready: false` (the card and the summary show « migration 099 à lancer ») and writes return 503 with the same French message; the briefing and the board load as before.

## How does the Studio publishing calendar post to Facebook and Instagram?

`/admin/studio/calendrier` (link "Calendrier" in the Studio project panel) shows one week, Monday to Sunday, in Ouagadougou time (UTC+0, so no conversion anywhere). Each day has the posting slots (`STUDIO_PUBLISH_SLOTS`, default `12:00,19:00`); a post at another time appears under "Autres heures". Posts live in `studio_publications` (migration 085), service role only.

- **Create:** "Nouvelle publication" or a dashed slot opens the editor: property, type (Vidéo, Image, Carrousel, Texte), media (the property's Studio videos and visuals from any project, or the listing's own photos, checked server side), caption, networks, date, slot, responsible person, notes. "Générer la légende" fills the house template from the listing (deterministic, `buildCaption` in `lib/studio/publishing.ts`).
- **Planifier une visite:** property plus visit date creates the five cadence posts on business days (`planVisitCadence`): Thursday visit gives Friday, Monday, Wednesday (carousel at 12:00, 3D link at 19:00), Thursday. Videos go at the last slot. The carousel is prefilled with the first 10 listing photos; videos wait for the team to pick the Studio render. A second plan for the same property and date is refused.
- **Approval:** staff press "Envoyer pour validation"; only a founder (`users.user_type = 'founder'`) can press "Valider", and only when the checks pass (no em dash, no "roogo.bf", no "faux", `roogobf.com` on its own line, media present, 2 to 10 carousel photos, JPEG for Instagram, no Instagram text post, TikTok only for a video and only when connected). Editing what goes out after approval sends the post back to "À valider".
- **Publishing:** the Vercel cron `/api/cron/studio-publish` (every 10 minutes, `CRON_SECRET`) takes up to 3 due posts. Each is claimed with one conditional update (`status = 'valide' AND claimed_at IS NULL`), so overlapping runs cannot both publish it. Studio files get a 3 h signed URL from `content-studio`; listing photos are already public. Results are saved per network after each one; a retry skips networks already published.
  - Facebook video: Reels flow (`video_reels` start, `rupload.facebook.com` with `file_url`, status poll, finish `PUBLISHED`). Facebook wants 9:16, 3 to 90 s, which is what the Studio renders.
  - Facebook image: `/{page}/photos`; several photos: unpublished photos then one `/{page}/feed` with `attached_media`. Text: `/{page}/feed`. The 3D link step is a comment under the same visit's Facebook carousel post.
  - Instagram: container (`REELS` with `share_to_feed`, image, or carousel of child containers), poll `status_code` until `FINISHED`, then `media_publish`. A container still processing is saved; "Réessayer" reuses it, and a container Instagram reports as already `PUBLISHED` is never published again.
- **Failures:** the post becomes "Échec" with a French message per network (expired token, missing permission, rate limit, refused file). A run that dies mid-publish leaves a claim; after 15 minutes the next run marks it "Échec: Publication interrompue. Vérifiez sur Facebook et Instagram avant de réessayer." It is never re-claimed automatically, because the post may already be online. "Réessayer" (staff or founder, the content is already approved) puts it back to "Validé".
- **TikTok (2026-10-21):** a validated **video** can also target TikTok, behind a feature flag: `TIKTOK_CLIENT_KEY` set, `SOCIAL_TOKENS_KEY` set, the `social_tokens` row of PR #78 (migration 100) present, and its scope holding `video.publish` (or `video.upload` with `TIKTOK_POST_MODE=draft`; optional env, default `direct`). Otherwise the button stays « Bientôt » with the reason as a tooltip, and the server refuses `tiktok` in `networks`. Publishing (`lib/social/tiktok-publish.ts`, Content Posting API): Direct Post `POST /v2/post/publish/video/init/` with `privacy_level: SELF_ONLY` (unaudited apps can only post privately), or Upload to drafts `POST /v2/post/publish/inbox/video/init/`; with `source: FILE_UPLOAD`: since 2026-10-23 the worker never downloads the whole video; it reads one 10 MB range at a time from the signed URL (`lib/studio/range-source.ts`, Range requests, a server that ignores Range is refused) and PUTs it to TikTok's `upload_url` with `Content-Range` (one chunk up to 10 MB, else 10 MB chunks with the remainder in the last, so under 20 MB in memory). Each chunk is tried 3 times, read again each time. `PULL_FROM_URL` is used only when `TIKTOK_PULL_URL_PREFIX` names a URL prefix verified in the TikTok developer portal and the signed link starts with it (TikTok then downloads it, nothing passes through the function). **Run limit:** a run stops starting chunks 30 s before its budget (`DEFAULT_RUN_BUDGET_MS` = 240 s, under the 300 s `maxDuration` of the cron and of « Valider »); the position (`resume`: `upload_url`, next chunk, sizes, expiry) is saved in `results.tiktok` after every chunk, the post stays « Validé » and the next run continues it. TikTok's `upload_url` lives one hour; a position older than 55 minutes starts a new upload (the old one never completed, so nothing was posted). `resume` is stripped from what the browser receives. Then `POST /v2/post/publish/status/fetch/` until `PUBLISH_COMPLETE` (or `SEND_TO_USER_INBOX` for drafts). The `publish_id` is saved before waiting, so a retry only checks it and never posts twice. The UI says « TikTok : publication privée tant que l'application n'est pas validée par TikTok ». The token is read (never written) by `lib/social/tiktok-token-server.ts`; an access token under 2 minutes from expiry is refused with a French message until PR #78's refresh is wired in (TODO in that file). TikTok comments and DMs are not readable with Login Kit and the Content Posting API.

Why this design: [decision](./DECISIONS.md#studio-publishing-calendar-founder-approval-and-direct-meta-posting--2026-10-12).

### Setting up the Meta connection (Salif, once)

Posting uses the same variables as the nightly follower readings (aligned 2026-10-17): `META_GRAPH_TOKEN` (system user token with the publish permissions below), `META_PAGE_ID` (`1046356035218080`), `META_IG_ACCOUNT_ID` (`17841436630471998`), optionally `META_GRAPH_VERSION` (default `v25.0`) and `STUDIO_PUBLISH_SLOTS`. `CRON_SECRET` already exists. Instagram calls use `META_GRAPH_TOKEN` directly; Facebook calls first read the Page token with `GET /{page-id}?fields=access_token` (once per cron run, never stored, never logged), so the system user must have the Page assigned. The first names of this branch, `META_PAGE_ACCESS_TOKEN` (a Page token) and `META_IG_USER_ID`, still work as fallbacks when the main names are absent. The calendar shows a yellow banner while the variables are missing. The AI description and hashtags need `OPENAI_API_KEY` (optional model override `STUDIO_CAPTION_MODEL`).

1. **Create the app.** At developers.facebook.com, "Create app", use case "Other", type **Business**, and attach it to the **Roogo Business portfolio**. Keep it in **Development mode**.
2. **Add products.** "Facebook Login for Business" and "Instagram" (the Instagram API with Facebook Login, since the Instagram professional account is linked to the Roogo Page). The Instagram account must be a Business or Creator account linked to the Page.
3. **Roles.** Salif's Facebook account is app **admin**, and has full control of the Page and the Instagram account in the Business portfolio. In Development mode, an app can use all permissions on assets its admins manage, so **no App Review is needed** while only Roogo's own Page and Instagram are used. App Review and Business Verification are needed only if other people's accounts ever connect.
4. **Permissions** (names checked against Meta's docs on 2026-10-12): `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` (Page posts and Reels), `pages_manage_engagement` (the 3D link comment), `publish_video` (listed by Meta for Page video publishing), `instagram_basic`, `instagram_content_publish`, and `business_management` to list the portfolio's Pages. Meta also lists `ads_management`/`ads_read` when the user's Page role comes through Business Manager; add them if a call answers with a permission error.
5. **Get a Page token that does not expire.** Recommended: in the Business portfolio, Settings, Users, **System users**, create an admin system user, assign the app, the Page (full control) and the Instagram account, then "Generate token" with the permissions above and **Expiration: Never**. Alternative: Graph API Explorer user token with the permissions, exchange it for a long-lived user token (`/oauth/access_token?grant_type=fb_exchange_token`, needs the app secret, do it in the Explorer or a terminal, never in the repo), then `GET /me/accounts`: the Page `access_token` derived from a long-lived user token has no expiry date. Check any token with the Access Token Debugger.
6. **Find the ids.** `GET /me/accounts` gives the Page `id`. `GET /{page-id}?fields=instagram_business_account` gives the Instagram user id.
7. **Set the variables in Vercel** (Production only), redeploy, then validate one test post in the calendar on a slot a few minutes ahead.

**Token expiry:** a system user token set to "Never" lasts until revoked; a Page token from a long-lived user token can still die if Salif changes his password, loses his Page role, or Meta invalidates the session. The cron then marks posts "Échec" with "Le jeton Meta a expiré ou a été révoqué": generate a new token (step 5), replace `META_GRAPH_TOKEN` in Vercel, redeploy, press "Réessayer". The token is never stored in the database and never logged.

Limits to keep in mind: Instagram allows 100 API posts per 24 h (Meta's page also says 50 for carousels), Facebook Reels 30 per 24 h; Roogo's cadence is far below.

### Studio > Réseaux (comments and messages inbox, 2026-10-21)

`/admin/studio/reseaux` (fourth tab of the Studio switch, guard `social.inbox`: Conseiller(ère) and above) gathers what people write to Roogo so nobody misses a buyer or an owner: « Commentaires » (comments on the Facebook Page's posts and on the Instagram media) and « Messages » (Messenger and Instagram direct conversations). Each card shows the network logo, the author, the text, the Ouagadougou time, the post with its thumbnail and caption, the VEN-/LOC- code found in the caption or the text (linked to `/admin/annonces/{id}` when the code exists), the status chip « À répondre » / « Répondu » / « Ignoré », and who replied and when. Filters: network, status. The count of « À répondre » shows on the Réseaux tab, on the Studio item of the staff navbar (terracotta badge, next to the amber « à valider » one) and as a line on Mon espace (« 3 commentaires et 2 messages attendent une réponse »).

- **Reading** (`lib/social/inbox.ts`, pure, tested with Meta fixtures in `lib/social/inbox.test.mjs`): with the Page token (swapped from `META_GRAPH_TOKEN`), `GET /{page}/published_posts` with `comments{from,message,...,comments{from}}` (15 latest posts, 50 comments each), `GET /{ig-user}?fields=username,media{...,comments{...,replies{...}}}`, and `GET /{page}/conversations?platform=messenger|instagram` with the last 10 messages. Comments written by the Page or @roogo.burkina are skipped; an item counts as answered when the Page wrote after the person.
- **Storage** (migration 101, run by Salif on 2026-10-21): `social_inbox_items` (one row per comment or conversation, unique on network + kind + external id), `social_inbox_replies` (every reply sent from Roogo, sent or failed, with the staff member), `social_inbox_sync` (last read and error per source). Service role only. Status after a sync (`statusAfterSync`): a new item waits for a reply unless the Page already answered it; the team's « Répondu » and « Ignoré » stay; a new message from the person reopens a conversation, even an ignored one; an answer seen in the Meta apps closes « À répondre » (« Répondu directement sur Instagram »). If the tables are missing the page shows « migration 101 à lancer », badges stay at 0, the cron answers `{ ready: false }` and writes answer 503.
- **Freshness**: `/api/cron/social-inbox` every 10 minutes (`CRON_SECRET`). « Actualiser » (`POST /api/admin/social/inbox/refresh`) reads again unless the last read is under 2 minutes old. Webhooks are a follow-up.
- **Replies** (`POST /api/admin/social/inbox/{id}/reply`): Facebook comment `POST /{comment}/comments`, Instagram comment `POST /{comment}/replies`, messages `POST /{page}/messages` (Messenger and Instagram Send API), with `messaging_type: RESPONSE` within 24 h of the person's last message, then `messaging_type: MESSAGE_TAG` + `tag: HUMAN_AGENT` up to 7 days (Human Agent feature, added to the Roogo Social app on 2026-10-21). Always as the Roogo Page / account. After 7 days the box is replaced by « Fenêtre de 7 jours dépassée : répondez sur Instagram directement » (Messenger for Facebook) and « Ouvrir la conversation ». Every attempt is logged with the staff member; on success the item becomes « Répondu » with `replied_by`. « Marquer comme répondu », « Ignorer » and « Remettre à répondre » (`PATCH /api/admin/social/inbox/{id}`) record who changed the status.
- **Errors**: per source card and per reply box, in French: expired token (190), missing permission with the exact permission name (`pages_read_user_content`, `pages_manage_engagement`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_messaging`), rate limit, window closed (subcodes 2018278, 2534022). Never the token or a URL; server logs `[social-inbox]` with status and code.
- **Meta permissions for `META_GRAPH_TOKEN`** (system user): `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content`, `pages_manage_engagement`, `pages_messaging`, `read_insights`, `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`, `business_management`. The system user needs the Page assigned with the tasks Content, Messages, Community activity and Insights, and the Instagram account with the same. For Instagram DMs, « Allow access to messages » for connected tools must be on in the Instagram app settings.
- **TikTok**: comments and messages are not available with Login Kit and the Content Posting API; the TikTok filter is shown as « Bientôt » with that note.
- **Reply deadline: 24 business hours** (rule set by Salif on 2026-10-21, `lib/social/sla.ts`, tested in `lib/social/sla.test.mjs`). Every item « À répondre » must be answered within 24 business hours: the clock runs all 24 hours of a working day and pauses on the other days. Working days are `BUSINESS_DAYS = [1, 2, 3, 4, 5]` (Monday to Friday, `getUTCDay` numbers; adding Saturday is one line), Ouagadougou time = UTC, no daylight saving. The start is the comment time (`remote_created_at`) or, for a conversation, the person's last message (`last_user_message_at`). `replyDueAt` adds 24 business hours (Tuesday 10:00 -> Wednesday 10:00, Friday 18:00 -> Monday 18:00, Saturday 15:00 -> Tuesday 00:00 because the clock starts Monday 00:00; a deadline at the end of a working day stays at that midnight, Friday 00:00 -> « sam. 00:00 »). Answering at exactly the deadline is on time. `slaState(item, now)` returns `{ dueAt, overdue, remainingMs | lateMs }` for « À répondre » only (Répondu and Ignoré have none); `lateMs` is business time, so the weekend does not grow the delay. This deadline is the team's; Meta's messaging window (24 h then 7 days with HUMAN_AGENT, wall clock) stays a separate rule that only decides whether Roogo can still send.
  - **Cards**: an item « À répondre » shows « À répondre avant lun. 18:00 » (short French weekday + HH:MM, Ouagadougou) in place of the status chip, or a red « En retard de 3 h » / « En retard de 2 j » (business hours, then whole 24-hour business days). Order: overdue first (most late first), then the nearest deadline; Répondu and Ignoré keep newest first. Filters: a status option « En retard » and, when the open tab has late items, a red « N en retard » toggle.
  - **Counts**: `inboxCounts()` reads the « À répondre » rows (kind and times only) and returns `{ comments, messages, total, overdue }` (`GET /api/admin/social/inbox/count`). The badge on the Réseaux tab, on the tabs « Commentaires » / « Messages » and on the Studio item of the staff navbar (`components/admin/InboxBadge.tsx`, shared) still shows the total; it turns red (`#8E2A1E`, the team board's danger token) when one is overdue, with the label « 5 à répondre, dont 2 en retard ». On the phone navbar icon a late inbox wins over the amber « à valider » badge. Mon espace: « 3 commentaires et 2 messages attendent une réponse sur Facebook et Instagram, dont 2 en retard. », in red when one is late.
  - **« Délai de réponse »** (Directeur and Fondateur only: `team.manage`, read on the server in `app/admin/studio/reseaux/page.tsx`, no new route): for the current week (Monday 00:00 Ouagadougou to now), per staff member who replied, the number of replies, the median and the longest delay, how many came after 24 business hours, and the team's share answered within 24 business hours. Built by `responseSummary` from migration 101's columns only (`replied_by`, `replied_at` vs the start above), no migration. Limits: migration 101 keeps only the last reply of an item, so one reply per item is measured and an earlier round of a conversation reopened by a new message is lost; « Marquer comme répondu » counts at the time it was pressed; replies made directly in the Meta apps have no time or person (`replied_externally`) and are listed apart, not measured.

### Studio > Statistiques (social numbers, 2026-10-19)

`/admin/studio/statistiques` (guard `studio.use`, third tab of the Studio switch) shows, for the Facebook Page and the Instagram account: followers with the 30-day change and a sparkline from `team_goal_readings` (the nightly `/api/cron/social-followers` readings, read only here), 28-day reach, views and interactions, the 12 latest posts with reach, views, likes, comments, shares, saves and engagement rate (interactions / reach), and the posting rhythm (last 7 and 30 days, average per week, days since the last post, 8 Monday-to-Sunday weeks).

- **Reading** (`lib/social/insights.ts`, pure, tested with a fake fetch in `lib/social/insights.test.mjs`): GET only, token in the Authorization header. Facebook: `/{page}` (followers), `/{page}/published_posts` (60 days, reactions/comments/shares from summaries), per post `/{video}/video_insights` (`post_impressions_unique`, `blue_reels_play_count`) for reels and videos or `/{post}/insights` (`post_total_media_view_unique`, `post_media_view`), `/{page}/insights?period=days_28`. Instagram: `/{ig}`, `/{ig}/media`, `/{media}/insights` (`reach`, `views`, `likes`, `comments`, `shares`, `saved`, `total_interactions`), `/{ig}/insights` with `metric_type=total_value` over 28 days. A metric Meta refuses as unknown is retried alone and skipped for the run (logged), so a renamed metric does not blank the page.
- **Errors**: each part is read on its own. Expired token (190), missing permission (10, 200-299), rate limit, Meta down and network errors become a French message on the card and a `[social-insights]` server log with status and code (never the token or URL). Without insights permissions the posts and likes still show, with a yellow note naming the permission.
- **Storage and refresh**: no table. The snapshot is cached in the Next data cache (`unstable_cache`, tag `social-insights`, 6 h). `/api/cron/social-insights` (every 6 h at minute 30, `CRON_SECRET`) drops and rebuilds it. A snapshot where neither account could be read is not cached. « Actualiser » (`POST /api/admin/social/insights`) relaunches the read unless the snapshot is under 10 minutes old. `GET /api/admin/social/insights` returns the same JSON. A table for per-post history was proposed, not added (PR description).
- **Permissions to add to the system user token for statistics**: `read_insights` (Page and post insights, with `pages_read_engagement`) and `instagram_manage_insights` (Instagram media and account insights). Without them the page still shows followers, posts and likes.
- **TikTok (2026-10-21)**: a third card for @roogo.226 from TikTok's Display API v2 with the token stored in `social_tokens` (`getFreshTikTokAccess`, refreshed when close to expiry). `GET /v2/user/info/` (follower_count, likes_count, video_count) and `POST /v2/video/list/` (20 per page, up to 60 videos or 60 days) give followers, « J'aime total », « Vidéos », the posting rhythm and per-video views, likes, comments and shares. TikTok gives no reach, saves or account views: the card shows « Vues des vidéos des 28 derniers jours » (sum of view_count of the videos posted in the last 28 days). Not connected or no `social_tokens` table: the card is where TikTok gets connected: the founder sees « Connecter TikTok » (`/api/admin/social/tiktok/connect`, the callback returns to `/admin/studio/statistiques?tiktok=<outcome>`; missing keys or migration 100 are named instead), the rest of the team reads « TikTok n'est pas encore connecté. <Prénom du fondateur> le connecte depuis Statistiques. »; once connected the founder has « Déconnecter TikTok » and « Dernière lecture ratée » at the bottom of the card, and connecting or disconnecting drops the cached snapshot. « Nos objectifs » no longer has a TikTok card. Meta is unaffected; a TikTok error never blanks Meta and the reverse. Follower trend from the nightly `tiktok_followers` readings. Same 6 h cache (key `social-insights-v2`), cron and « Actualiser ».
- **Facebook per-post reach (2026-10-21)**: a reach of 0 next to views or interactions is shown as « – ». A video shared again in a later post (same `attachments.target.id`) reads `video_insights` on its oldest post only; the re-share uses its own post insights (the 28 Sept reel and its 30 Sept re-share both showed 9 533 plays).

## How does Publier une vidéo work? (2026-10-23)

`/admin/studio/publier` (Studio tab « Publier », guard `studio.use`) takes one finished vertical video to every network after Salif's OK (PRDs 2 and 3). Code: `lib/studio/publish-everywhere.ts` (pure rules, tested in `publish-everywhere.test.mjs`), `lib/studio/final-videos-server.ts` (Drive, links, facts), routes under `/api/admin/studio/final-videos`, page `app/admin/studio/publier/`. Table `studio_final_videos` and four columns on `studio_publications` (migration 105).

1. **Check, then upload.** The browser reads length and displayed size (`readVideoShape`) and refuses anything that is not MP4/MOV, vertical 9:16 (ratio 0.5625 ± 0.02), at most 180 s (0.5 s tolerance) and 500 MB, or that it cannot read. `POST /api/admin/studio/final-videos` checks the same numbers, opens a Drive resumable session in « Vidéos finales » named « Roogo - <titre> - <AAAA-MM-JJ>.<ext> » and returns its address; the browser sends 16 MiB chunks straight to Google (4 MiB through `PUT .../[id]/chunk` when Google refuses the browser) and continues from the byte Google kept after a cut (`uploadResumableToDrive` in `app/admin/studio/field-upload.ts`, shared with field media). `POST .../[id]/finalize` marks the video ready only when Drive has it in the folder at the right size and, when Drive already measured it, still vertical and at most 3 minutes. The same person re-sending the same file within 6 days resumes it.
2. **Networks.** Facebook, Instagram and TikTok are ticked when connected (Meta env, TikTok publishing flag), with the reason when not. YouTube Shorts is in the list as « (à connecter) » and never ticked; the server drops it (`ticksToNetworks`) until PRD 1 connects it. The database column already accepts `youtube`.
3. **Texts.** « Préparer les textes » (`POST .../[id]/copy`) makes one Responses call with `STUDIO_CAPTION_MODEL` (default `gpt-5-mini`): base plus one version per ticked network, from the linked listing's title, offer, place and price (optional VEN-/LOC- search, `/api/admin/studio/properties?q=VEN-023`), the title and a one-line note. The model is told not to write phones, the site or a price line. `finalizeNetworkCopy` then: replaces long dashes, fixes roogo.bf, moves hashtag lines out, drops any line with a phone number (Roogo's lines are put back), keeps 3 emoji, adds « Prix : … » (always on Facebook and in the base, elsewhere when the text does not already give the right price), « Lieu : … » when the place is not named, then « WhatsApp : 67 00 61 16 · Appel : 53 11 11 19 » and roogobf.com on their own lines, and keeps the hashtags in range (Facebook 2 to 3, Instagram 5 to 10, TikTok 3 to 5, base 3 to 5; topped up with house tags). « Régénérer » sends one network with the current base. « Même texte partout » sends the finalized base to every network. The page runs the same functions live; the server runs them again on send, on every edit and at publish.
4. **Envoyer à Salif.** `POST .../[id]/send` creates (or, after a « Demander une modification », updates) the `studio_publications` row: `media_type = video`, `final_video_id`, `network_copy`, `same_text`, `publish_on_approval` (« Dès que Salif valide », default) or a future `scheduled_at` (Ouagadougou = UTC), status `a_valider`, `submitted_by`. Errors in any text block the send. The Drive file is renamed if the title or listing changed. Accueil shows « Valider la vidéo : <titre> » to each founder (automatic source, no stored task) linking to `/admin/studio/publier?publication=<id>`, which opens the approval preview with the video (staff stream) and each network's text in tabs.
5. **Valider.** Founder only (`canChangeStatus`). The checks: video ready in Drive, networks, TikTok connection, `networkCopyErrors` with the listing's facts. With `publish_on_approval`, `scheduled_at` becomes the approval time and `runPublishingWorker({ onlyId })` starts after the answer; the cron also picks it up. « Demander une modification » is the existing « Renvoyer » (required comment); the sender gets « Corriger la vidéo » on Accueil and a « Corriger » button in « Mes vidéos ».
6. **Publishing.** The worker gives Meta and TikTok a 3-hour signed link to `/api/admin/studio/final-videos/[id]/stream` (public in `middleware.ts`, HMAC over `final:<id>` and the expiry, same secret as field media; Range supported; a staff session also works). Each network posts its own text (`network_copy`, else the base). Before each network the texts are checked again; a failure is that network's error. Facebook: Reel up to 90 s, a regular Page video above; Meta fetches the signed link itself (`file_url`). Instagram: Reels container, Meta fetches `video_url`. TikTok: private until audited, chunked upload by Range reads (or `PULL_FROM_URL` under a verified prefix), resumable across runs. No path loads the whole video in a function. The stream route proxies Drive's bytes as a stream (no buffering) with `maxDuration` 300 s, so Meta must download within 5 minutes (500 MB needs about 1.7 MB/s); a slower download fails that network with Meta's error and « Réessayer » starts it again. Results, links and errors are saved per network; « Réessayer » on one network (`PATCH /api/admin/studio/publications/[id]` `{ action: "retry", network }`) holds the other failed networks for that run. When every network is published, the Drive file moves to « Publié » and `published_folder_at` is set.

**Drive folders.** Resolved by name under `ROOGO_SHARED_DRIVE_ID`: « Videos » › « Vidéos finales » › « Publié » (accents and case ignored, cached 10 minutes). If a name is missing or Drive cannot list, `STUDIO_FINAL_VIDEOS_FOLDER_ID` and `STUDIO_PUBLISHED_VIDEOS_FOLDER_ID` are used, defaulting to `1F0c8fvcSe8jRebUS5AG6c9OdWlr57DZC` and `134K4IcaN7NyuaVKcCANJxd062aR22LZ9`. The service account (`GOOGLE_SERVICE_ACCOUNT_*`) needs edit rights on both folders (it already has the shared drive for field media).

**Storage.** The only copy is the Drive file, which the team keeps; nothing is stored in Supabase Storage, so there is nothing to clean up after publishing. An upload never sent stays in « Vidéos finales » and in « Mes vidéos » with « Continuer ».

Why this design: [decision](./DECISIONS.md#publier-une-vidéo-one-upload-to-drive-every-network-after-salifs-ok--2026-10-23).
