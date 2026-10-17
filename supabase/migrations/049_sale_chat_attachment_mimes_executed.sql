-- 049: Fix the sale-chat bucket mime allowlist (voice notes + documents).
--
-- The sale-chat-attachments bucket was created (040, re-created in 044) with
-- allowed_mime_types = images only. Storage enforces that list at PUT time, so
-- every voice-note upload (audio/mp4) has been rejected with a 415 since voice
-- shipped (047 only extended the message_type CHECK), and the new document
-- attachments (048) would be rejected the same way. The signed-URL creation
-- itself succeeds, which is why the failure only shows on the PUT.
--
-- Also lifts the per-file size cap from 10 MB to 20 MB to match the client's
-- document cap (images are compressed client-side; a 2-minute voice note is
-- well under 1 MB).
--
-- Idempotent, kazedra-style.

UPDATE storage.buckets
SET
  file_size_limit = 20971520, -- 20 MB
  allowed_mime_types = ARRAY[
    -- images (unchanged)
    'image/jpeg', 'image/png', 'image/webp',
    -- voice notes (expo-audio records m4a; uploaded as audio/mp4)
    'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac',
    -- documents (mirrors SALE_CHAT_DOCUMENT_TYPES in lib/sale-chat.ts)
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]
WHERE id = 'sale-chat-attachments';
