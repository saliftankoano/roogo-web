/**
 * Text sanitization helpers.
 *
 * IMPORTANT: do NOT use `validator.escape()` on user-submitted text before
 * storing it in the database. HTML encoding (`&#x27;` for apostrophes, `&amp;`
 * for ampersands, etc.) is a rendering concern. Storing encoded text means every
 * plain-text consumer — push notifications, React Native, PDF generation — will
 * display literal HTML entity strings instead of the intended characters. French
 * text is particularly affected: apostrophes, accented characters and `&` all
 * get mangled.
 *
 * `sanitizeForStorage` is the correct sanitizer for database writes: it trims
 * whitespace and strips HTML tags (XSS prevention), but leaves all printable
 * characters — including `'`, `é`, `ô`, `à`, `&`, etc. — untouched.
 *
 * `unescapeText` unwraps HTML entities in text already in the database that was
 * stored with the old `validator.escape()` path. Use it wherever DB text is
 * consumed in a plain-text context (notification params, SMS, PDF).
 */

import validator from "validator";

/** Strip HTML tags and trim, but preserve all printable characters.
 *  The regex matches only real tags (< followed by an optional / then a letter)
 *  so prose like "loyer < 100k et > 50k" is left intact. */
export function sanitizeForStorage(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  // Trim whitespace, then strip HTML tags only (not bare < / > operators).
  return validator.trim(value).replace(/<\/?[a-zA-Z][^>]*>/g, "");
}

/**
 * Decode HTML entities stored by the legacy `validator.escape()` path.
 * Safe to call on already-clean text: it's a no-op when there are no entities.
 */
export function unescapeText(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  return validator.unescape(value);
}
