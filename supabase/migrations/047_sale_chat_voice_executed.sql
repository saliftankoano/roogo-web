-- 047: Voice notes in the sale chat.
--
-- Many Burkinabè owners are more comfortable speaking than typing; WhatsApp
-- trained the voice-note gesture. A voice message is a sale_messages row with
-- message_type 'voice' plus one m4a attachment in sale_message_attachments
-- (same transport as images). Duration lives in sale_messages.metadata as
-- { "duration_seconds": <number> }.
--
-- Idempotent, kazedra-style: drop + re-add the CHECK constraint.

ALTER TABLE public.sale_messages
  DROP CONSTRAINT IF EXISTS sale_messages_message_type_check;

ALTER TABLE public.sale_messages
  ADD CONSTRAINT sale_messages_message_type_check
  CHECK (message_type IN (
    'text', 'voice', 'visit_request', 'visit_confirmation',
    'mandate_offer', 'mandate_signed', 'notary_meeting'
  ));
