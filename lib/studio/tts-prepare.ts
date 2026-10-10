// Turns the text staff read on screen into the text sent to the TTS voice.
// Display text keeps normal spelling; only the spoken copy is respelled.
//
// Source of truth for the respellings: the business vault note
// "04 Marketing/Voice pronunciation quirks". Update both together.
// Checked on Sandrine only. Add per-voice overrides here if Salif's voice
// needs different spellings after the by-ear test.

export const MAX_TTS_CHARACTERS = 1200;

const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf",
];
const TENS = [
  "",
  "",
  "vingt",
  "trente",
  "quarante",
  "cinquante",
  "soixante",
];

function below100(n: number, final = true): string {
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    if (unit === 0) return TENS[ten];
    return `${TENS[ten]}${unit === 1 ? " et un" : `-${UNITS[unit]}`}`;
  }
  if (n < 80) {
    // 70 to 79: soixante-dix ... soixante et onze ... soixante-dix-neuf
    const rest = n - 60;
    return rest === 11 ? "soixante et onze" : `soixante-${UNITS[rest]}`;
  }
  // 80 to 99: quatre-vingts, quatre-vingt-un ... quatre-vingt-dix-neuf
  const rest = n - 80;
  if (rest === 0) return final ? "quatre-vingts" : "quatre-vingt";
  return `quatre-vingt-${UNITS[rest]}`;
}

// "final": cent and quatre-vingt take an s only at the very end of a number
// ("deux cents", but "deux cent mille", "quatre-vingt mille").
function below1000(n: number, final = true): string {
  if (n < 100) return below100(n, final);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent`;
  if (rest === 0) return hundreds === 1 || !final ? head : `${UNITS[hundreds]} cents`;
  return `${head} ${below100(rest, final)}`;
}

/**
 * French words for any whole amount up to 999 999 999 999, for prices:
 * 50 000 000 -> "cinquante millions", 1 500 000 -> "un million cinq cent mille".
 */
export function amountToFrench(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1e12) {
    throw new RangeError("amountToFrench supports integers below 10^12");
  }
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const billions = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const thousands = Math.floor((n % 1e6) / 1e3);
  const rest = n % 1e3;
  if (billions) parts.push(`${below1000(billions)} milliard${billions > 1 ? "s" : ""}`);
  if (millions) parts.push(`${below1000(millions)} million${millions > 1 ? "s" : ""}`);
  if (thousands) parts.push(thousands === 1 ? "mille" : `${below1000(thousands, false)} mille`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** French words for 0 to 9999 (enough for years and small figures). */
export function numberToFrench(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) {
    throw new RangeError("numberToFrench supports integers from 0 to 9999");
  }
  if (n < 1000) return below1000(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = thousands === 1 ? "mille" : `${UNITS[thousands]} mille`;
  return rest === 0 ? head : `${head} ${below1000(rest)}`;
}

function twoDigitPairWords(pair: string): string {
  const value = Number(pair);
  if (pair.startsWith("0")) {
    return value === 0 ? "zéro zéro" : `zéro ${UNITS[value]}`;
  }
  return below100(value);
}

/** Reads a phone number in French pairs: "67 00 61 16" becomes spoken pairs. */
export function phoneToSpokenPairs(digits: string): string {
  const clean = digits.replace(/\D/g, "");
  const pairs: string[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    pairs.push(clean.slice(i, i + 2));
  }
  return pairs
    .map((pair) => (pair.length === 1 ? UNITS[Number(pair)] : twoDigitPairWords(pair)))
    .join(", ");
}

// Order matters: longer and more specific words first. Each rule carries the
// label shown to staff when it fires.
type Respelling = {
  term: string;
  spoken: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
};

const RESPELLINGS: Respelling[] = [
  { term: "Ouagadougou", spoken: "Waga", pattern: /\bOuagadougou\b/gi, replacement: "Waga" },
  { term: "Ouaga", spoken: "Waga", pattern: /\bOuaga\b/gi, replacement: "Waga" },
  { term: "Burkina Faso", spoken: "Bourkina Faso", pattern: /\bBurkina\s+Faso\b/gi, replacement: "Bourkina Faso" },
  { term: "Burkina", spoken: "Bourkina", pattern: /\bBurkina\b/gi, replacement: "Bourkina" },
  { term: "Roogo", spoken: "Rohgo", pattern: /\bRoogo\b/gi, replacement: "Rohgo" },
  { term: "Nagrin", spoken: "Nagrain", pattern: /\bNagrin\b/gi, replacement: "Nagrain" },
  {
    term: "parcelle",
    spoken: "par-celle",
    pattern: /\bparcelles?\b/gi,
    replacement: (match) => match.replace(/parcelle/i, "par-celle"),
  },
  // Found on 2026-10-06: the voice read "FCFA" as "francs CFA BAK".
  { term: "FCFA", spoken: "francs CFA", pattern: /\bF\s?CFA\b/g, replacement: "francs CFA" },
  // "R+1" is spoken "R plus un" (a ground floor and one storey).
  {
    term: "R+1, R+2...",
    spoken: "R plus un, R plus deux...",
    pattern: /\bR\+(\d)\b/g,
    replacement: (_match, floors) => `R plus ${numberToFrench(Number(floors))}`,
  },
];

/** Built-in respellings, shown read-only in the team glossary. */
export const BUILTIN_RESPELLINGS: ReadonlyArray<{ term: string; spoken: string }> = [
  { term: "Roogo", spoken: "Rohgo" },
  { term: "Burkina Faso", spoken: "Bourkina Faso" },
  { term: "Ouaga / Ouagadougou", spoken: "Waga" },
  { term: "Nagrin", spoken: "Nagrain" },
  { term: "parcelle", spoken: "par-celle" },
  { term: "FCFA", spoken: "francs CFA" },
  { term: "R+1, R+2...", spoken: "R plus un, R plus deux..." },
];

export type GlossaryEntry = { term: string; spoken: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One rule that changed the spoken text, with how many times it fired. */
export type SpeechReplacement = { term: string; spoken: string; count: number };

function countedReplace(
  text: string,
  pattern: RegExp,
  replacement: string | ((match: string, ...groups: string[]) => string),
): { out: string; count: number } {
  let count = 0;
  const out = text.replace(pattern, (...args: unknown[]) => {
    count += 1;
    return typeof replacement === "string"
      ? replacement
      : replacement(...(args as [string, ...string[]]));
  });
  return { out, count };
}

const ACCENTS: Record<string, string> = {
  a: "aàâä",
  c: "cç",
  e: "eéèêë",
  i: "iîï",
  o: "oôö",
  u: "uùûü",
  y: "yÿ",
};

/**
 * A pattern for a glossary term that also matches the usual variants staff and
 * the script model write (Salif, 2026-10-10): any case, with or without accents,
 * and spaces or hyphens between words ("Tanghin", "TANGHIN", "Tanghîn",
 * "Bobo-Dioulasso", "Bobo Dioulasso"). Plurals are added by the caller.
 */
export function tolerantPattern(term: string): string {
  return [...term.normalize("NFD").replace(/\p{M}/gu, "")]
    .map((ch) => {
      if (/[\s-]/.test(ch)) return "[\\s\\-]+";
      const lower = ch.toLowerCase();
      return ACCENTS[lower] ? `[${ACCENTS[lower]}]` : escapeRegExp(ch);
    })
    .join("")
    .replace(/(\[\\s\\-\]\+)+/g, "[\\s\\-]+");
}

// Amounts written in digits before a currency ("50 000 000 FCFA", "250.000 F CFA").
// Spoken in words so the voice never misreads a long number.
const PRICE_PATTERN =
  /(?<![\d])(\d{1,3}(?:[ .\u00a0\u202f]\d{3})+|\d{4,12})\s?(?:F\s?CFA|FCFA|francs?\s+CFA|XOF)\b/gi;

function applyPrices(text: string): { out: string; count: number } {
  return countedReplace(text, PRICE_PATTERN, (_match: string, digits: string) => {
    const value = Number(digits.replace(/\D/g, ""));
    if (!Number.isSafeInteger(value) || value >= 1e12) return _match;
    const words = amountToFrench(value);
    // "cinquante millions de francs CFA", but "deux cent mille francs CFA".
    return `${words}${/(million|milliard)s?$/.test(words) ? " de" : ""} francs CFA`;
  });
}

/**
 * Team glossary entries run first so a team override beats the built-in
 * table. Whole words only, case-insensitive, letters and digits of any
 * language count as word characters (so "Zongo" does not match "Zongoma").
 */
function applyGlossaryDetailed(
  text: string,
  glossary: ReadonlyArray<GlossaryEntry>,
): { out: string; replacements: SpeechReplacement[] } {
  let out = text;
  const replacements: SpeechReplacement[] = [];
  // Longest terms first so "Burkina Faso" wins over "Burkina".
  const ordered = [...glossary].sort((a, b) => b.term.length - a.term.length);
  for (const entry of ordered) {
    const term = entry.term.trim();
    if (!term) continue;
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${tolerantPattern(term)}(s|x)?(?![\\p{L}\\p{N}])`,
      "giu",
    );
    // A plural keeps its ending: "parcelles" -> "par-celles".
    const result = countedReplace(out, pattern, (_match: string, plural?: string) => entry.spoken + (plural ?? ""));
    out = result.out;
    if (result.count) replacements.push({ term, spoken: entry.spoken, count: result.count });
  }
  return { out, replacements };
}

export function applyGlossary(
  text: string,
  glossary: ReadonlyArray<GlossaryEntry>,
): string {
  return applyGlossaryDetailed(text, glossary).out;
}

function applyRespellingsDetailed(text: string): { out: string; replacements: SpeechReplacement[] } {
  let out = text;
  const replacements: SpeechReplacement[] = [];
  for (const rule of RESPELLINGS) {
    const result = countedReplace(out, rule.pattern, rule.replacement);
    out = result.out;
    if (result.count) replacements.push({ term: rule.term, spoken: rule.spoken, count: result.count });
  }
  return { out, replacements };
}

// International (+226 ...) and local 8-digit numbers, with optional spaces,
// dots or dashes between pairs. At least eight digits are required so prices
// such as "25 000 000" are not mistaken for phone numbers: those have groups
// of three digits, which the pattern excludes.
const PHONE_PATTERN =
  /(?:\+\s?226[\s.-]?)?(?<![\d])(\d{2})[\s.-]?(\d{2})[\s.-]?(\d{2})[\s.-]?(\d{2})(?![\d])(?!\s?(?:FCFA|F\s?CFA|XOF|francs?))/g;

function applyPhones(text: string): string {
  return text.replace(PHONE_PATTERN, (match, a, b, c, d) => {
    const prefix = /^\+\s?226/.test(match) ? "deux cent vingt-six, " : "";
    return `${prefix}${phoneToSpokenPairs(`${a}${b}${c}${d}`)}`;
  });
}

// A four-digit year between 1900 and 2099 standing alone.
const YEAR_PATTERN = /(?<![\d.,])(19\d{2}|20\d{2})(?![\d])/g;

function applyYears(text: string): string {
  return text.replace(YEAR_PATTERN, (_match, year) =>
    numberToFrench(Number(year)),
  );
}

/**
 * Display text in, spoken text out, with the list of rules that fired so
 * staff can see exactly what the voice will be told. Phones run first so
 * their digits are not touched by the year rule.
 */
export function prepareForSpeechDetailed(
  displayText: string,
  glossary: ReadonlyArray<GlossaryEntry> = [],
): { spoken: string; replacements: SpeechReplacement[] } {
  const team = applyGlossaryDetailed(displayText.trim(), glossary);
  const prices = applyPrices(team.out);
  const builtIn = applyRespellingsDetailed(prices.out);
  const spoken = applyYears(applyPhones(builtIn.out));
  const priceRule = prices.count
    ? [{ term: "Prix en chiffres", spoken: "prix en lettres", count: prices.count }]
    : [];
  return { spoken, replacements: [...team.replacements, ...priceRule, ...builtIn.replacements] };
}

/** Display text in, spoken text out. */
export function prepareForSpeech(
  displayText: string,
  glossary: ReadonlyArray<GlossaryEntry> = [],
): string {
  return prepareForSpeechDetailed(displayText, glossary).spoken;
}
