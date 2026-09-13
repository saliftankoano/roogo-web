-- 048: Document attachments in the sale chat (PDF and common office types).
--
-- Land titles, mandates, plans and receipts circulate as PDFs and Word/Excel
-- files in Burkina real estate deals. A document is a regular 'text'
-- sale_messages row with one attachment in sale_message_attachments (same
-- transport as images and voice notes). file_name preserves the original
-- name for display; mime_type already distinguishes documents from images.
--
-- Idempotent, kazedra-style.

ALTER TABLE public.sale_message_attachments
  ADD COLUMN IF NOT EXISTS file_name text;

COMMENT ON COLUMN public.sale_message_attachments.file_name IS
  'Original file name of a document attachment, shown in the chat bubble. Null for images and voice notes.';
