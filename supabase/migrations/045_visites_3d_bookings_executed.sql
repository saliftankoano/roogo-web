-- Roogo — Visites 3D bookings (migrated from the Kazedra site).
--
-- The `bookings` table, its indexes, the availability view and RLS were
-- originally created by the kazedra repo's migrations 0001–0003 against this
-- same Supabase project. Roogo now owns the 3D-visits service, so this
-- migration (a) reproduces that final state idempotently so this folder is
-- self-describing, and (b) applies the new single-rate pricing (15 000 FCFA
-- per pièce for everyone) by dropping the legacy `with_roogo` discount flag.

create extension if not exists "pgcrypto";

-- ── 1. Baseline: table as left by kazedra migrations 0001–0003 ───────────
-- No-op on the live database; creates the table on a fresh environment.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot text not null check (slot in (
    '07:00-09:00',
    '09:00-11:00',
    '11:00-13:00',
    '13:00-15:00',
    '15:00-17:00'
  )),
  name text not null,
  company text,
  phone text not null,
  email text,
  address text not null,
  notes text,
  status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  payment_deposit_id text,
  payment_status text not null default 'pending'
    check (payment_status in (
      'pending', 'submitted', 'completed', 'failed', 'cancelled', 'refunded'
    )),
  payment_provider text
    check (payment_provider in ('ORANGE_BFA', 'MOOV_BFA')),
  held_until timestamptz,
  room_count integer not null default 1 check (room_count >= 1),
  total_amount bigint not null
);

-- Status check (kazedra 0002 added 'pending_payment').
alter table public.bookings
  drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending_payment', 'confirmed', 'cancelled', 'completed'));

-- One active booking per (date, slot); cancelled rows don't block re-booking.
create unique index if not exists bookings_active_slot_uniq
  on public.bookings (date, slot)
  where status <> 'cancelled';

-- PawaPay depositId is a UUID — enforce uniqueness so a callback cannot match
-- multiple rows.
create unique index if not exists bookings_payment_deposit_id_uniq
  on public.bookings (payment_deposit_id)
  where payment_deposit_id is not null;

-- ── 2. Pricing change: single rate, no Roogo-bundle discount ─────────────
alter table public.bookings
  drop column if exists with_roogo;

-- ── 3. Availability view ─────────────────────────────────────────────────
-- A slot is "taken" if it's confirmed, or pending_payment with an unexpired
-- 8-minute hold. Expired holds are excluded (self-healed to 'cancelled' by
-- /api/visites-3d/initiate).
create or replace view public.booking_slots_view as
  select date, slot
  from public.bookings
  where status = 'confirmed'
     or (status = 'pending_payment' and held_until > now());

alter view public.booking_slots_view set (security_invoker = true);

-- ── 4. RLS ───────────────────────────────────────────────────────────────
-- No public access to the raw table — API routes use the service role.
alter table public.bookings enable row level security;

drop policy if exists "no public access" on public.bookings;
create policy "no public access" on public.bookings for all using (false) with check (false);

grant select on public.booking_slots_view to anon;
grant select on public.booking_slots_view to authenticated;
