BEGIN;

-- ---------------------------------------------------------------------------
-- 1. updated_at trigger for property_pending_edits
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_pending_edits_set_updated_at
  ON public.property_pending_edits;

CREATE TRIGGER property_pending_edits_set_updated_at
  BEFORE UPDATE ON public.property_pending_edits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Re-run HTML-entity unescape in a loop (max 3 passes) so any text that
--    was double-escaped (e.g. &amp;#x27; → &#x27; → ') fully decodes.
--    Migration 032 already ran one pass; this handles edge cases.
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

DO $$
DECLARE
  pass     INT  := 0;
  affected INT;
BEGIN
  LOOP
    pass := pass + 1;

    UPDATE public.properties
    SET    description = pg_temp.unescape_html(description)
    WHERE  description IS NOT NULL
      AND  description ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)';

    UPDATE public.properties
    SET    quartier = pg_temp.unescape_html(quartier)
    WHERE  quartier IS NOT NULL
      AND  quartier ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)';

    UPDATE public.properties
    SET    address = pg_temp.unescape_html(address)
    WHERE  address IS NOT NULL
      AND  address ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)';

    UPDATE public.properties
    SET    dos_and_donts = (
             SELECT array_agg(pg_temp.unescape_html(elem))
             FROM   unnest(dos_and_donts) AS elem
           )
    WHERE  dos_and_donts IS NOT NULL
      AND  dos_and_donts::text ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)';

    -- Count remaining affected rows to decide whether to loop again
    SELECT COUNT(*) INTO affected
    FROM   public.properties
    WHERE  (description  ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)'
            AND description IS NOT NULL)
        OR (quartier      ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)'
            AND quartier IS NOT NULL)
        OR (address       ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)'
            AND address IS NOT NULL)
        OR (dos_and_donts::text ~ '(&amp;|&quot;|&#x27;|&lt;|&gt;|&#x2F;)'
            AND dos_and_donts IS NOT NULL);

    EXIT WHEN affected = 0 OR pass >= 3;
  END LOOP;
END;
$$;

COMMIT;
