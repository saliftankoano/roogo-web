-- Studio projects started from a property request (« demande spécifique »,
-- Salif 2026-10-30). Run after 107 (107_fix_record_property_view), BEFORE deploying the code that reads
-- studio_conversations.property_request_id (roogo-web PR #109).
--
-- A project points to its request by id, not by title: titles are not unique
-- and change when a request is edited. One open project per person and per
-- request; the unique index lets the API find-or-create in one step, so a
-- double click can never create two projects or pay for two first drafts.

ALTER TABLE public.studio_conversations
  ADD COLUMN IF NOT EXISTS property_request_id UUID
    REFERENCES public.property_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS studio_conversations_user_request_open_idx
  ON public.studio_conversations (user_id, property_request_id)
  WHERE property_request_id IS NOT NULL AND archived_at IS NULL;
