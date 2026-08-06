BEGIN;

ALTER TABLE public.properties
  ALTER COLUMN agent_id DROP NOT NULL;

CREATE TABLE public.sale_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL UNIQUE REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_first_name TEXT NOT NULL,
  owner_last_name TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  phone_has_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  linked_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  linked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'unlinked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_intakes_status_check
    CHECK (status IN ('unlinked', 'linked', 'cancelled')),
  CONSTRAINT sale_intakes_link_state_check CHECK (
    (status = 'linked' AND linked_user_id IS NOT NULL AND linked_at IS NOT NULL)
    OR
    (status <> 'linked' AND linked_user_id IS NULL AND linked_at IS NULL)
  )
);

CREATE INDEX sale_intakes_status_idx
  ON public.sale_intakes(status, created_at DESC);
CREATE INDEX sale_intakes_phone_idx
  ON public.sale_intakes(owner_phone);

CREATE TRIGGER update_sale_intakes_updated_at
  BEFORE UPDATE ON public.sale_intakes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sale_intakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_intakes FROM anon, authenticated;
GRANT ALL ON public.sale_intakes TO service_role;

CREATE OR REPLACE FUNCTION public.link_sale_intake_owner(
  p_property_id UUID,
  p_target_user_id UUID,
  p_actor_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intake public.sale_intakes%ROWTYPE;
  v_property public.properties%ROWTYPE;
  v_target_type TEXT;
  v_conversation_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_welcome TEXT :=
    'Votre annonce a été rattachée à votre compte. L''équipe Roogo vous accompagnera ici pour les documents de propriété et le mandat de vente.';
BEGIN
  SELECT * INTO v_property
  FROM public.properties
  WHERE id = p_property_id
  FOR UPDATE;

  IF NOT FOUND OR v_property.listing_type <> 'vendre' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_direct_sale');
  END IF;

  SELECT * INTO v_intake
  FROM public.sale_intakes
  WHERE property_id = p_property_id
  FOR UPDATE;

  IF NOT FOUND OR v_intake.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_direct_sale');
  END IF;

  IF v_intake.status = 'linked' OR v_property.agent_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_linked');
  END IF;

  SELECT user_type INTO v_target_type
  FROM public.users
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'owner_not_found');
  END IF;

  IF v_target_type NOT IN ('owner', 'agent') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_owner_type');
  END IF;

  UPDATE public.properties
  SET agent_id = p_target_user_id
  WHERE id = p_property_id;

  UPDATE public.sale_intakes
  SET
    linked_user_id = p_target_user_id,
    linked_by = p_actor_user_id,
    linked_at = v_now,
    status = 'linked'
  WHERE id = v_intake.id;

  INSERT INTO public.sale_conversations (
    property_id,
    kind,
    user_id,
    status,
    last_message_at,
    last_message_preview,
    unread_for_user
  ) VALUES (
    p_property_id,
    'seller',
    p_target_user_id,
    'open',
    v_now,
    v_welcome,
    1
  )
  ON CONFLICT (property_id, user_id, kind)
  DO UPDATE SET status = 'open'
  RETURNING id INTO v_conversation_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sale_messages
    WHERE conversation_id = v_conversation_id
      AND sender_type = 'system'
      AND body = v_welcome
  ) THEN
    INSERT INTO public.sale_messages (
      conversation_id,
      sender_id,
      sender_type,
      message_type,
      body
    ) VALUES (
      v_conversation_id,
      NULL,
      'system',
      'text',
      v_welcome
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'intake_id', v_intake.id,
    'owner_id', p_target_user_id,
    'conversation_id', v_conversation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_sale_intake_owner(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_sale_intake_owner(UUID, UUID, UUID)
  TO service_role;

-- Public listing source: rentals keep their existing contact card, while sales
-- never expose the seller's account id or profile fields.
DO $$
DECLARE
  v_property_columns TEXT;
BEGIN
  SELECT string_agg(
    CASE
      WHEN column_name IN ('agent_id', 'owner_id') THEN
        format(
          'CASE WHEN p.listing_type = ''vendre'' THEN NULL ELSE p.%I END AS %I',
          column_name,
          column_name
        )
      ELSE format('p.%I', column_name)
    END,
    ', ' ORDER BY ordinal_position
  )
  INTO v_property_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'properties';

  EXECUTE 'DROP VIEW IF EXISTS public.public_property_details';
  EXECUTE format($view$
    CREATE VIEW public.public_property_details
    WITH (security_invoker = true)
    AS
    SELECT
      %s,
      CASE WHEN p.listing_type = 'vendre' THEN NULL ELSE u.full_name END AS agent_name,
      CASE WHEN p.listing_type = 'vendre' THEN NULL ELSE u.avatar_url END AS agent_avatar,
      CASE WHEN p.listing_type = 'vendre' THEN NULL ELSE u.phone END AS agent_phone,
      CASE WHEN p.listing_type = 'vendre' THEN NULL ELSE u.email END AS agent_email,
      CASE WHEN p.listing_type = 'vendre' THEN NULL ELSE u.user_type END AS agent_type,
      CASE WHEN p.listing_type = 'vendre' THEN NULL ELSE u.company_name END AS agent_company_name,
      CASE WHEN p.listing_type = 'vendre' THEN NULL ELSE u.professional_link END AS agent_facebook_url,
      CASE WHEN p.listing_type = 'vendre' THEN NULL ELSE u.identity_verification_status END
        AS agent_identity_verification_status,
      CASE WHEN p.listing_type = 'vendre' THEN FALSE
        ELSE u.identity_verification_status = 'approved'
      END AS agent_identity_verified,
      (p.ownership_verification_status = 'approved') AS ownership_verified,
      r.full_name AS renter_name,
      r.phone AS renter_phone,
      r.email AS renter_email,
      r.avatar_url AS renter_avatar,
      pl.locked_at AS lock_timestamp,
      pl.status AS lock_status,
      ARRAY_AGG(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL) AS amenities,
      ARRAY_AGG(DISTINCT pi.url) FILTER (WHERE pi.url IS NOT NULL) AS images,
      (
        SELECT COUNT(*) FROM public.favorites f WHERE f.property_id = p.id
      ) AS favorites_count
    FROM public.properties p
    LEFT JOIN public.users u ON p.agent_id = u.id
    LEFT JOIN public.property_locks pl ON p.id = pl.property_id AND pl.status = 'active'
    LEFT JOIN public.users r ON pl.renter_id = r.id
    LEFT JOIN public.property_amenities pa ON p.id = pa.property_id
    LEFT JOIN public.amenities a ON pa.amenity_id = a.id
    LEFT JOIN public.property_images pi ON p.id = pi.property_id
    GROUP BY p.id, u.id, r.id, pl.id
  $view$, v_property_columns);
END;
$$;

REVOKE ALL ON public.public_property_details FROM PUBLIC;
GRANT SELECT ON public.public_property_details TO anon, authenticated, service_role;
REVOKE ALL ON public.property_details FROM anon, authenticated;
GRANT SELECT ON public.property_details TO service_role;

COMMIT;
