-- 104: job applications with a deadline (public page /carrieres/<slug>).
--
-- NOT EXECUTED. Written for review; Salif runs it before the PR is merged.
-- Safe to run twice. Touches no existing table or bucket.
--
-- First role: « Commercial(e) en immobilier », temps plein, applications open
-- until Wednesday 2026-10-28 23:59 Ouagadougou (UTC+0). The role config
-- (slug, deadline, questions) lives in lib/job-applications.ts.
--
--   job_applications   one row per application: contact, CV, the last sales,
--                      a reference, the sales video (file in the private
--                      bucket or a TikTok / YouTube / Drive / Facebook link),
--                      the listing shown for the video, the answers, the start
--                      date and the staff review (status, notes, reviewer).
--
-- One application per phone number per role: unique (role_slug, phone). The
-- API answers a friendly message on the unique violation (23505).
--
-- Access: RLS on, no policy, anon and authenticated revoked. Every read and
-- write goes through the service role in /api/careers/job-applications
-- (public, deadline and rate limit checked) and /api/admin/recrutement
-- (talent.manage: Fondateur and Directeur).
--
-- Storage: PRIVATE bucket `candidatures` with its allowlist and size limit,
-- because signed upload URLs validate nothing; the bucket does, at PUT time
-- (see the 049 lesson in CLAUDE.md). 150 MB per file for the sales video.
-- No storage policy: only the service role reads (short signed URLs for the
-- staff review) and signs uploads.
-- The project-wide Storage upload limit (Dashboard > Storage > Settings) must
-- be at least 150 MB too, otherwise videos above it fail with 413 whatever
-- the bucket says.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_slug TEXT NOT NULL CHECK (role_slug ~ '^[a-z0-9-]{2,60}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Step 1 « Toi »
  full_name TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 3 AND 120),
  phone TEXT NOT NULL CHECK (phone ~ '^\+226[0-9]{8}$'),
  quartier TEXT NOT NULL CHECK (char_length(btrim(quartier)) BETWEEN 2 AND 80),
  email TEXT CHECK (email IS NULL OR char_length(email) <= 160),
  cv_path TEXT CHECK (cv_path IS NULL OR char_length(cv_path) <= 200),

  -- Step 2 « Tes ventes »: [{propertyType, quartier, price, year, buyerSource}]
  sales JSONB NOT NULL CHECK (
    jsonb_typeof(sales) = 'array'
    AND jsonb_array_length(sales) BETWEEN 1 AND 3
  ),
  -- {name, phone, relation}
  reference JSONB NOT NULL CHECK (jsonb_typeof(reference) = 'object'),

  -- Step 3 « Le test vidéo »
  video_path TEXT CHECK (video_path IS NULL OR char_length(video_path) <= 200),
  video_url TEXT CHECK (video_url IS NULL OR char_length(video_url) <= 500),
  listing_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  -- What the candidate saw (reference, title, quartier, price, path), kept
  -- even if the listing changes or is removed later.
  listing_snapshot JSONB,

  -- Step 4 « Mises en situation »: {questionId: answer}
  answers JSONB NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  can_start_on_date BOOLEAN NOT NULL,
  available_from DATE,
  consent_at TIMESTAMPTZ NOT NULL,

  -- Staff review
  status TEXT NOT NULL DEFAULT 'nouveau'
    CHECK (status IN ('nouveau', 'retenu', 'entretien', 'refuse')),
  reviewer_notes TEXT CHECK (reviewer_notes IS NULL OR char_length(reviewer_notes) <= 4000),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  CONSTRAINT job_applications_video_present CHECK (video_path IS NOT NULL OR video_url IS NOT NULL),
  CONSTRAINT job_applications_start_date CHECK (can_start_on_date OR available_from IS NOT NULL),
  CONSTRAINT job_applications_one_per_phone UNIQUE (role_slug, phone)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_role_created
  ON public.job_applications (role_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_applications_role_status
  ON public.job_applications (role_slug, status, created_at DESC);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.job_applications FROM anon, authenticated;
GRANT ALL ON TABLE public.job_applications TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidatures',
  'candidatures',
  false,
  157286400, -- 150 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
