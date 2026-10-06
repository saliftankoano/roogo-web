-- Team-shared pronunciation glossary for the Content Studio.
-- Everyone on staff can read and add entries. Deleting is limited to the
-- entry's author or a founder, enforced in /api/admin/studio/glossary.
-- RLS enabled with no policies: access is only through the service role.

CREATE TABLE IF NOT EXISTS public.studio_glossary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL CHECK (char_length(term) BETWEEN 1 AND 60),
  spoken TEXT NOT NULL CHECK (char_length(spoken) BETWEEN 1 AND 120),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One entry per term (case-insensitive) so two people cannot contradict each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_glossary_term_lower
  ON public.studio_glossary (lower(term));

ALTER TABLE public.studio_glossary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_glossary FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.studio_glossary TO service_role;
