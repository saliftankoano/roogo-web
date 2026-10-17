BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'talent-documents',
  'talent-documents',
  false,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.talent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT 'Roogo',
  hiring_objective TEXT NOT NULL,
  employment_type TEXT NOT NULL DEFAULT 'assessment',
  location TEXT NOT NULL DEFAULT 'Burkina Faso',
  salary_range TEXT,
  description TEXT NOT NULL,
  success_metrics TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.talent_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.talent_jobs(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  challenge_type TEXT NOT NULL DEFAULT 'sales_leads',
  instructions TEXT NOT NULL,
  deadline_hours INTEGER NOT NULL DEFAULT 48,
  target_leads INTEGER NOT NULL DEFAULT 3,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, slug),
  CONSTRAINT talent_challenges_type_check CHECK (challenge_type IN ('sales_leads'))
);

CREATE TABLE IF NOT EXISTS public.talent_candidate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  location TEXT NOT NULL,
  languages TEXT[] NOT NULL DEFAULT '{}',
  resume_path TEXT NOT NULL,
  resume_filename TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS public.talent_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_profile_id UUID NOT NULL REFERENCES public.talent_candidate_profiles(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.talent_jobs(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES public.talent_challenges(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'applied',
  challenge_assigned_at TIMESTAMPTZ,
  challenge_deadline_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  shortlisted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  hired_at TIMESTAMPTZ,
  appeal_note TEXT,
  appeal_submitted_at TIMESTAMPTZ,
  reviewer_score INTEGER,
  reviewer_notes TEXT,
  reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(candidate_profile_id, job_id),
  CONSTRAINT talent_applications_status_check CHECK (
    status IN ('applied', 'challenge_assigned', 'submitted', 'under_review', 'shortlisted', 'rejected', 'hired')
  ),
  CONSTRAINT talent_applications_score_check CHECK (
    reviewer_score IS NULL OR (reviewer_score >= 0 AND reviewer_score <= 100)
  )
);

CREATE TABLE IF NOT EXISTS public.talent_lead_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.talent_applications(id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  notes TEXT NOT NULL,
  matched_owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  matched_property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  candidate_visible_status TEXT NOT NULL DEFAULT 'received',
  review_status TEXT NOT NULL DEFAULT 'unreviewed',
  reviewer_notes TEXT,
  partial_credit BOOLEAN NOT NULL DEFAULT false,
  credited BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT talent_leads_visible_status_check CHECK (
    candidate_visible_status IN ('received', 'under_review', 'credited', 'duplicate', 'converted', 'rejected')
  ),
  CONSTRAINT talent_leads_review_status_check CHECK (
    review_status IN ('unreviewed', 'valid_new', 'duplicate', 'invalid', 'converted')
  )
);

CREATE TABLE IF NOT EXISTS public.talent_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.talent_applications(id) ON DELETE CASCADE,
  lead_submission_id UUID REFERENCES public.talent_lead_submissions(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talent_profiles_user_id
  ON public.talent_candidate_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_talent_applications_status
  ON public.talent_applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_talent_applications_job
  ON public.talent_applications(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_talent_leads_application
  ON public.talent_lead_submissions(application_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_talent_leads_match_owner
  ON public.talent_lead_submissions(matched_owner_id)
  WHERE matched_owner_id IS NOT NULL;

ALTER TABLE public.talent_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_challenges DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_candidate_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_lead_submissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_review_events DISABLE ROW LEVEL SECURITY;

INSERT INTO public.talent_jobs (
  slug,
  title,
  hiring_objective,
  employment_type,
  location,
  salary_range,
  description,
  success_metrics
)
VALUES (
  'roogo-property-acquisition',
  'Chargé(e) acquisition propriétaires',
  'Identifier et convaincre des propriétaires de publier leurs biens sur Roogo.',
  'Évaluation',
  'Ouagadougou, Burkina Faso',
  'À discuter après évaluation',
  'Roogo cherche des personnes capables de trouver des propriétaires fiables, communiquer clairement et transformer des conversations terrain en opportunités de listing.',
  ARRAY['3 contacts propriétaires qualifiés en 48h', 'Notes claires sur chaque conversation', 'Respect strict du délai']
)
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  hiring_objective = EXCLUDED.hiring_objective,
  employment_type = EXCLUDED.employment_type,
  location = EXCLUDED.location,
  salary_range = EXCLUDED.salary_range,
  description = EXCLUDED.description,
  success_metrics = EXCLUDED.success_metrics,
  is_active = true,
  updated_at = now();

INSERT INTO public.talent_challenges (
  job_id,
  slug,
  title,
  instructions,
  deadline_hours,
  target_leads,
  is_paid
)
SELECT
  id,
  'owner-leads-48h',
  'Trouver 3 contacts propriétaires en 48h',
  'Soumettez trois contacts de propriétaires avec nom, téléphone, adresse ou zone, et des notes précises sur la conversation. Les doublons peuvent recevoir un crédit partiel si les notes sont utiles.',
  48,
  3,
  false
FROM public.talent_jobs
WHERE slug = 'roogo-property-acquisition'
ON CONFLICT (job_id, slug) DO UPDATE
SET
  title = EXCLUDED.title,
  instructions = EXCLUDED.instructions,
  deadline_hours = EXCLUDED.deadline_hours,
  target_leads = EXCLUDED.target_leads,
  is_paid = EXCLUDED.is_paid,
  updated_at = now();

COMMIT;
