BEGIN;

ALTER TABLE public.property_requests
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT property_requests_created_by_fkey,
  ADD CONSTRAINT property_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.property_request_responses
  ALTER COLUMN respondent_id DROP NOT NULL,
  ADD COLUMN respondent_deleted_at TIMESTAMPTZ,
  ADD COLUMN property_deleted_at TIMESTAMPTZ,
  DROP CONSTRAINT property_request_responses_respondent_id_fkey,
  ADD CONSTRAINT property_request_responses_respondent_id_fkey FOREIGN KEY (respondent_id) REFERENCES public.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT property_request_responses_property_id_fkey,
  ADD CONSTRAINT property_request_responses_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;

-- Private files are removed asynchronously after the database transaction commits.
CREATE TABLE public.property_request_file_cleanup_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);
CREATE INDEX property_request_file_cleanup_pending_idx ON public.property_request_file_cleanup_queue(created_at) WHERE processed_at IS NULL;
ALTER TABLE public.property_request_file_cleanup_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_request_file_cleanup_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.property_request_file_cleanup_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.property_request_file_cleanup_queue_id_seq TO service_role;

CREATE FUNCTION public.queue_removed_property_request_files() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO property_request_file_cleanup_queue(path)
    SELECT file->>'path' FROM jsonb_array_elements(OLD.attachments) file
    WHERE TG_OP = 'DELETE' OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.attachments) retained WHERE retained->>'path' = file->>'path'
    );
  RETURN OLD;
END;
$$;
CREATE TRIGGER property_request_files_removed AFTER UPDATE OF attachments OR DELETE ON public.property_request_responses
  FOR EACH ROW EXECUTE FUNCTION public.queue_removed_property_request_files();

-- Keep the agreed economics, but remove contact details and private submissions.
CREATE FUNCTION public.anonymize_deleted_property_respondent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE property_request_responses SET respondent_id = NULL, respondent_deleted_at = now(),
    contact_phone = '', address = '', neighborhood = '', description = '', document_notes = '',
    document_types = ARRAY['Aucun document'], attachments = '[]', staff_notes = ''
    WHERE respondent_id = OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER property_respondent_deleted BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.anonymize_deleted_property_respondent();

-- A removed listing is no longer published; its confirmed agreement survives.
CREATE FUNCTION public.unlink_deleted_property_response() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE property_request_responses SET property_id = NULL, property_deleted_at = now(),
    status = CASE WHEN status = 'listed' THEN 'accepted' ELSE status END
    WHERE property_id = OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER property_response_listing_deleted BEFORE DELETE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.unlink_deleted_property_response();

REVOKE ALL ON FUNCTION public.queue_removed_property_request_files(), public.anonymize_deleted_property_respondent(), public.unlink_deleted_property_response() FROM PUBLIC, anon, authenticated;
COMMIT;
