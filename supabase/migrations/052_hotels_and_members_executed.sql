-- 052: Hotel entities, memberships, and invite codes
-- Hotels are modeled as plain tables (not Clerk Organizations): all privileged
-- writes go through the service-role backend; RLS grants members read access.

BEGIN;

CREATE TABLE IF NOT EXISTS hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  phone TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE hotels IS 'Hotel entities. A hotel groups one or more properties and a team of members (admin = gérant, staff = réceptionniste).';

ALTER TABLE properties ADD COLUMN IF NOT EXISTS hotel_id UUID REFERENCES hotels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_properties_hotel_id ON properties(hotel_id) WHERE hotel_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS hotel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  invited_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, user_id)
);

-- One active membership per user across ALL hotels (CVP rule). Enforced at
-- the schema so two concurrent joins with codes from different hotels cannot
-- both land; routes translate the 23505 into a 409.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_members_one_active
  ON hotel_members(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_hotel_members_hotel ON hotel_members(hotel_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS hotel_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 5 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_invites_hotel ON hotel_invites(hotel_id);

-- Atomic invite consumption: validates and increments in one statement so
-- concurrent joins can neither exceed max_uses nor under-count. Returns the
-- invite row when consumed, no row when invalid/expired/exhausted/revoked.
CREATE OR REPLACE FUNCTION consume_hotel_invite(p_code TEXT)
RETURNS SETOF hotel_invites
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE hotel_invites
  SET used_count = used_count + 1
  WHERE code = p_code
    AND revoked_at IS NULL
    AND expires_at > now()
    AND used_count < max_uses
  RETURNING *;
$$;

-- Compensation for a join that consumed the invite but failed to create the
-- membership (e.g. the user already belongs to another hotel).
CREATE OR REPLACE FUNCTION release_hotel_invite_use(p_invite_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE hotel_invites
  SET used_count = GREATEST(0, used_count - 1)
  WHERE id = p_invite_id;
$$;

-- RLS: members of a hotel can read their hotel, its members, and its invites.
-- All writes happen through the service-role backend.
-- Membership lookups use a SECURITY DEFINER helper: a hotel_members policy
-- that selects from hotel_members directly would recurse infinitely.
CREATE OR REPLACE FUNCTION current_user_hotel_role(p_hotel_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hm.role
  FROM hotel_members hm
  JOIN users u ON u.id = hm.user_id
  WHERE hm.hotel_id = p_hotel_id
    AND hm.status = 'active'
    AND u.clerk_id = auth.jwt() ->> 'sub'
  LIMIT 1;
$$;

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hotel members can view their hotel"
ON hotels FOR SELECT
USING (current_user_hotel_role(id) IS NOT NULL);

CREATE POLICY "Hotel members can view memberships of their hotel"
ON hotel_members FOR SELECT
USING (current_user_hotel_role(hotel_id) IS NOT NULL);

CREATE POLICY "Hotel admins can view invites of their hotel"
ON hotel_invites FOR SELECT
USING (current_user_hotel_role(hotel_id) = 'admin');

COMMIT;
