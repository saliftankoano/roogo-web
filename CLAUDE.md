# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Roogo Web / Backend** is the Next.js 15 web app + API that powers the Roogo real estate marketplace in Burkina Faso. It serves three audiences:

1. **Public visitors** — browse properties, read articles, view open houses (`/proprietes`, `/p/[id]`, landing pages).
2. **Signed-in users** — owner/agent dashboards at `/mes-proprietes`, rental agreement tooling, application tracking.
3. **Staff & founders** — admin panel at `/admin` for moderating listings, managing users, analytics, finances, content, and settings.

It also acts as the **sole backend for the Expo mobile app** (`roogo` sibling repo): all authenticated mutations from mobile hit this app's `/api/*` routes.

## Commands

```bash
npm run dev      # Next.js dev server with Turbopack on port 3000 (binds 0.0.0.0)
npm run build    # Production build (Turbopack)
npm run start    # Run production build
npm run lint     # ESLint
```

Vercel is the target host (see `vercel.json` for cron schedules).

## Architecture

### Tech Stack

- **Next.js 15.5** (App Router) with **React 19** and **TypeScript 5**
- **Turbopack** (both dev and prod builds)
- **Tailwind CSS 4** + **shadcn/ui** component primitives + **Radix UI** (Label, Separator, Switch, Tabs, Slot)
- **Phosphor Icons** and **Lucide React** — don't mix both in the same screen unless intentional; Phosphor is the primary icon set
- **Framer Motion** — page/modal animations
- **Clerk (`@clerk/nextjs`, `@clerk/backend`)** — authentication & user metadata (staff/founder/owner/agent/renter)
- **Supabase** (`@supabase/supabase-js`) — Postgres DB + Storage (bucket: `listing`)
- **Upstash Redis + Ratelimit** — API rate limiting (`lib/rate-limit.ts`)
- **PostHog** (`posthog-js` client + `posthog-node` server) — product analytics and server events
- **PawaPay** — Orange Money / Moov Money payments for Burkina Faso (sandbox numbers in `docs/pawapay-test-numbers.md`)
- **Svix** — Clerk webhook verification
- **React-PDF** — generate rental-agreement PDFs
- **heic-to** — client-side HEIC → JPEG for iPhone uploads
- **Zod + Validator** — input validation

### Directory Structure

```
app/
  layout.tsx               # Root layout, Clerk provider, PostHog bootstrap (instrumentation-client.ts)
  page.tsx                 # Public landing
  globals.css              # Tailwind entry
  (auth)/                  # /connexion, /inscription (Clerk sign-in UI)
  proprietes/              # Public listing browse
  p/[id]/, proprietes/[id]/# Public property detail (shareable, unauthenticated)
  annonces/creer/          # Create-listing wizard (authenticated)
  mes-proprietes/          # Owner/agent dashboard
  admin/                   # Staff & founder admin panel
    analytiques/, annonces/, calendrier/, candidatures/, contenu/,
    finances/, parametres/, utilisateurs/
  personnel/               # Staff onboarding & join flow
  onboarding/              # Post-sign-up type-selection + per-type onboarding
  payments/                # Payment callback / status pages
  carrieres/               # Careers pages
  a-propos/, nous-contacter/, confidentialite/, conditions-utilisation/
  plan-du-site/, supprimer-compte/
  api/                     # All route handlers — see below
  opengraph-image.tsx, sitemap.ts, robots.ts

components/
  Navbar.tsx, Footer.tsx, Hero.tsx, HomeClient.tsx, …  # Landing + shell
  PropertyCard.tsx, PropertyDetailsModal.tsx           # Listing UI
  admin/                   # Admin panel components (PhotoManager, etc.)
  property-form/           # PropertyFormModal + subcomponents (LocationPicker, PhotoUploader…)
  payment/                 # PawaPay payment flows
  onboarding/              # Type-selection, step screens
  motion-primitives/       # Reusable Framer Motion wrappers
  ui/                      # shadcn primitives (Button, Input, Dialog, …)
  carrieres/               # Career page blocks

lib/
  supabase.ts              # Client-side Supabase (anon key)
  supabase-admin.ts        # Server-side service-role Supabase (bypasses RLS)
  user-sync.ts             # Mirror Clerk user → Supabase user record
  request-auth.ts          # Parse & verify Clerk JWTs on Bearer-auth API routes
  api-helpers.ts           # cors(), corsOptions() wrappers for mobile-facing routes
  rate-limit.ts            # Upstash ratelimit helpers
  clientImageCompression.ts# Browser-side image resize + HEIC decode → JPEG base64
  clientPendingPhotos.ts   # Stash base64 photos in DB across payment redirects
  property-storage.ts      # Supabase Storage helpers (upload / delete / signed URL)
  posthog-server.ts        # Server-side captureServerEvent
  validations.ts, schemas.ts # Zod schemas shared with forms
  interdictions.ts, constants.ts, data.ts, mockData.ts
  pawapay-config.ts, payment-limits.ts
  push-notifications.ts, view-tracking.ts
  navigation/              # Route helpers

supabase/
  migrations/              # SQL migrations (numbered, e.g. 014_user_property_cascade_cleanup.sql)

middleware.ts              # Clerk auth + onboarding gate
next.config.ts             # Images, redirects, experimental body-size config
instrumentation-client.ts  # PostHog init
vercel.json                # Cron: /api/cron/aggregate-views, property-storage-cleanup
docs/                      # pawapay-test-numbers.md, runbooks, integration notes
```

### API Routes (`app/api/*`)

Grouped by concern. Every route handler is in `route.ts`.

- `api/properties/` — CRUD for listings, `[id]/upload-images`, `[id]/images`, `[id]/status`, `[id]/availability`
- `api/rental-agreements/`, `api/rent-schedules/`, `api/rent-payments/` — tenancy lifecycle
- `api/applications/` — rental applications + `me` (mobile)
- `api/payments/`, `api/pawapay/` — PawaPay init, status polling, callback webhook, payment page
- `api/favorites/`, `api/views/` — engagement tracking
- `api/clerk/` — user-metadata sync, webhook receiver, `users/me/metadata`
- `api/admin/` — staff-only endpoints
- `api/cron/` — scheduled jobs (aggregate-views, property-storage-cleanup)
- `api/pricing/`, `api/push-tokens/`, `api/auth/`, `api/users/`
- `api/careers/apply`, `api/account/delete-request`, `api/health`, `api/test-webhook`

### Middleware (`middleware.ts`)

Runs Clerk auth on every request. Two matchers:

1. **`isPublicRoute`** — skip auth entirely (landing, `/p/*`, `/proprietes/*`, public API endpoints like `/api/pawapay/callback`, `/api/favorites`, `/api/applications/me`, all `/api/cron/*`, availability queries).
2. **`isOnboardingGateExempt`** — skip the onboarding redirect (onboarding pages themselves, `/admin/*`, `/personnel/*`, all `/api/*`).

Everything else: authenticated + checks `sessionClaims.metadata.userType` and `hasCompletedWebOnboarding` / `hasCompletedMobileOnboarding`. Incomplete onboarding → `/onboarding`. Staff and founders are always exempt from the onboarding gate.

### Auth Model

- **Browser sessions** — Clerk session cookie, verified by middleware via `auth.protect()`.
- **Mobile app & server-to-server** — Bearer JWTs verified with `verifyToken` from `@clerk/backend`. Many API routes parse `Authorization: Bearer <clerkToken>` manually because mobile can't use session cookies. Helpers live in `lib/request-auth.ts`.
- **User-type source of truth** — Clerk `publicMetadata.userType` (`owner`, `renter`, `agent`, `staff`, `founder`). `lib/user-sync.ts` mirrors the user into a Supabase `users` row on first contact so we can FK against it in our schema.

### Supabase

- **Two clients** — anon (`lib/supabase.ts`, used for public read queries) and service-role (`lib/supabase-admin.ts` / `getSupabaseClient()`, used in route handlers to bypass RLS).
- **Storage bucket** — `listing` (public) for property photos. Filenames: `{propertyId}/{index}-{timestamp}-{random}.{ext}`.
- **Migrations** — numeric prefix (012, 013, 014…). When renaming, don't leave the date-stamped duplicate around; it confuses the migration runner.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
PAWAPAY_API_TOKEN
PAWAPAY_URL
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
```

### Design System

Tailwind 4 with shadcn component library and Radix primitives under `components/ui/`. Primary typeface is **Urbanist** (matches the mobile app). Brand tokens (Terracotta Ember, Clay Brown, Sahel Sky) live in `app/globals.css` and `tailwind.config` equivalent inside the Tailwind v4 `@theme` block. Keep parity with `roogo/theme/tokens.ts` when introducing new tokens.

### Configuration notes

- `next.config.ts` — image `remotePatterns` whitelists Supabase + Clerk image hosts. The `experimental.middlewareClientMaxBodySize` **must stay ≥ 25mb** as long as upload routes accept base64-in-JSON payloads (see principles below). `serverActions.bodySizeLimit` mirrors the same number.
- `vercel.json` — crons: `aggregate-views` hourly batching at 03:00 UTC, `property-storage-cleanup` hourly.

## Engineering Principles

Lessons we've paid for once. Add to this list whenever we ship a fix that wasn't obvious up front — the mobile repo's `CLAUDE.md` keeps a parallel list; keep them in sync when the lesson is platform-agnostic.

### Debug with runtime evidence, not guesses

- Before fixing a bug, add logs at every boundary of the suspect flow (inputs, branches, network response, caught errors). Read the logs, then fix.
- A fix without reproduced evidence is just a new bug.
- Prefer specific error messages over generic ones: include HTTP status, response body, error name, and file/user context. Generic `alert("Erreur...")` is tech debt — it erases the one clue you'll need next time. The pattern to copy is in `components/admin/PhotoManager.tsx`'s `handleFileSelect` catch block.

### Don't trust user-reported geography or device as the cause

When only user X fails and user Y on the same code works, the differentiator is almost always **their data or their device**, not their location. Look at the variables you haven't checked (file size, format, browser, session age).

### Image uploads: compress and normalize on the client

- Always resize to a sane max dimension (we use 1920 px longest side) before upload. No user listing needs a 12 MP photo.
- Always re-encode to a widely supported format. JPEG at ~0.82 quality is the baseline. **Never ship HEIC to storage** — Chrome and Firefox cannot render it in `<img>`/`next/image`.
- iPhone originals are HEIC by default. Detect via magic bytes (`isHeic(file)` from `heic-to`) _and_ filename regex — iOS sometimes sets the MIME type to empty.
- Always route new upload flows through `lib/clientImageCompression.ts::compressImageToBase64()`. Don't reinvent a `fileToBase64` helper locally.

### Base64-in-JSON is a bad transport for binary data

Base64 adds ~33% overhead and every body-size limit in the stack will blindside you:

- **Next.js 15** caps `middlewareClientMaxBodySize` at 10 MB by default and **silently truncates** bodies that exceed it. The route handler then receives malformed JSON and `req.json()` throws `SyntaxError: Unterminated string`. Raise the limit in `next.config.ts` when needed, but compress first.
- **Vercel Serverless Functions** have their own payload limits (~4.5 MB on Hobby, higher on Pro). Keep payloads well under these.

For scale beyond a few images, prefer direct-to-Supabase uploads with signed URLs or `multipart/form-data`. If we keep base64 JSON, it's only viable because we now compress aggressively on the client.

### When a framework version bumps, read the breaking-changes page

Silent behaviour changes are the worst kind of bug. Always review Next.js / Clerk / Supabase / React release notes when bumping majors — the 10 MB body truncation above was a Next.js 15-only regression in behaviour.

### Don't let two places silently diverge

If two components do "basically the same thing" (e.g. file-to-base64 helpers), extract one shared utility into `lib/`. Duplicate implementations drift, and the bug you fixed in one is still alive in the other. We had the same upload bug in `components/admin/PhotoManager.tsx` and `components/property-form/PropertyFormModal.tsx` because each had its own local helper.

### API routes that serve both web and mobile

Any route reachable from the Expo app must:

1. Be listed in `middleware.ts` `isPublicRoute` if it uses Bearer JWT auth (mobile can't send Clerk session cookies).
2. Handle `OPTIONS` via `corsOptions()` and wrap every response in `cors()` (`lib/api-helpers.ts`).
3. Verify the JWT with `verifyToken` and resolve the Supabase user via `lib/user-sync.ts` before any write. Don't trust the `clerkUserId` as a FK directly — our DB keys off the Supabase `users.id`.

### Never log secrets

No Clerk tokens, PawaPay API keys, Supabase service keys, or raw user PII in `console.log`, PostHog events, or error alerts. When instrumenting, log token _length_ and presence, never contents.
