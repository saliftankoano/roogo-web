# Concepts

Reference answers to "how does X work" questions worth keeping. Organized by topic,
not dated. For the reasoning behind these, see [`DECISIONS.md`](./DECISIONS.md); for
what shipped and when, see [`CHANGELOG.md`](./CHANGELOG.md).

---

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

**Bottom line:** a message carries a nullable `read_at`. When the *recipient* opens a
thread, the server stamps `read_at = now()` on the other party's un-read messages; the
*sender's* client sees that change live over Realtime and flips the bubble from
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
already "ours" — no data moved. Migration `045_visites_3d_bookings.sql` still needs
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

## What are the AT_* / TEAM_PHONE env vars for (Visites 3D)?

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
   (their desired price), plus ownership proof — primarily the **PUH** (*Permis
   Urbain d'Habiter*). The commission model is disclosed before they submit.
2. A seller↔Roogo chat (one thread per property) opens automatically. Roogo reviews
   the ownership docs.
3. Roogo sends a **mandate** (desired price + commission percentages + an
   exclusivity period). The owner **signs it in-app** (tap-to-confirm + typed name).
   Signing publishes the listing at the desired price.
4. Only then is the listing publishable and photographed by Roogo. Staff may then
   adjust the public price (`properties.price`) freely to experiment; the seller is
   deliberately NOT shown or notified of Roogo's listing price.

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
