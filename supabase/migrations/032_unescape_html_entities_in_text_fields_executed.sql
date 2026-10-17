-- Migration: unescape HTML entities stored by the old validator.escape() path.
--
-- Background: the property-creation API used `validator.escape()` on user-submitted
-- text before inserting it into the database. This converted apostrophes to &#x27;,
-- ampersands to &amp;, etc. HTML encoding is correct for HTML rendering contexts but
-- produces garbled text everywhere else: push notifications, React Native, PDFs, SMS.
--
-- This migration decodes those entities in the affected columns (description,
-- quartier, address, dos_and_donts). The application code has been updated
-- simultaneously to no longer encode at write time.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: unescape the six HTML entities that validator.escape() produces.
-- Defined as a local function, dropped at the end of this transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.unescape_html(s TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(s, '&#x27;', ''''),
              '&amp;',   '&'),
            '&quot;',  '"'),
          '&lt;',    '<'),
        '&gt;',    '>'),
      '&#x2F;',  '/')
$$;

-- ---------------------------------------------------------------------------
-- properties.description
-- ---------------------------------------------------------------------------
UPDATE public.properties
SET    description = pg_temp.unescape_html(description)
WHERE  description IS NOT NULL
  AND  description ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)';

-- ---------------------------------------------------------------------------
-- properties.quartier
-- ---------------------------------------------------------------------------
UPDATE public.properties
SET    quartier = pg_temp.unescape_html(quartier)
WHERE  quartier IS NOT NULL
  AND  quartier ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)';

-- ---------------------------------------------------------------------------
-- properties.address  (stored as "quartier, ville" — same entities possible)
-- ---------------------------------------------------------------------------
UPDATE public.properties
SET    address = pg_temp.unescape_html(address)
WHERE  address IS NOT NULL
  AND  address ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)';

-- ---------------------------------------------------------------------------
-- properties.dos_and_donts  (text[] array)
-- Rebuild the array by mapping each element through unescape_html.
-- ---------------------------------------------------------------------------
UPDATE public.properties
SET    dos_and_donts = (
         SELECT array_agg(pg_temp.unescape_html(elem))
         FROM   unnest(dos_and_donts) AS elem
       )
WHERE  dos_and_donts IS NOT NULL
  AND  dos_and_donts::text ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)';

COMMIT;
