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

function below100(n: number): string {
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
  if (rest === 0) return "quatre-vingts";
  return `quatre-vingt-${UNITS[rest]}`;
}

function below1000(n: number): string {
  if (n < 100) return below100(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent`;
  if (rest === 0) return hundreds === 1 ? "cent" : `${UNITS[hundreds]} cents`;
  return `${head} ${below100(rest)}`;
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

// Order matters: longer and more specific words first.
const RESPELLINGS: Array<
  [RegExp, string | ((match: string, ...groups: string[]) => string)]
> = [
  [/\bOuagadougou\b/gi, "Waga"],
  [/\bOuaga\b/gi, "Waga"],
  [/\bBurkina\s+Faso\b/gi, "Bourkina Faso"],
  [/\bBurkina\b/gi, "Bourkina"],
  [/\bRoogo\b/gi, "Rohgo"],
  [/\bNagrin\b/gi, "Nagrain"],
  [/\bparcelles?\b/gi, (match) => match.replace(/parcelle/i, "par-celle")],
  // Found on 2026-10-06: the voice read "FCFA" as "francs CFA BAK".
  [/\bF\s?CFA\b/g, "francs CFA"],
  // "R+1" is spoken "R plus un" (a ground floor and one storey).
  [/\bR\+(\d)\b/g, (_match, floors) => `R plus ${numberToFrench(Number(floors))}`],
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

/**
 * Team glossary entries run first so a team override beats the built-in
 * table. Whole words only, case-insensitive, letters and digits of any
 * language count as word characters (so "Zongo" does not match "Zongoma").
 */
export function applyGlossary(
  text: string,
  glossary: ReadonlyArray<GlossaryEntry>,
): string {
  let out = text;
  // Longest terms first so "Burkina Faso" wins over "Burkina".
  const ordered = [...glossary].sort((a, b) => b.term.length - a.term.length);
  for (const entry of ordered) {
    const term = entry.term.trim();
    if (!term) continue;
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`,
      "giu",
    );
    out = out.replace(pattern, () => entry.spoken);
  }
  return out;
}

function applyRespellings(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RESPELLINGS) {
    out = out.replace(pattern, replacement as never);
  }
  return out;
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
 * Display text in, spoken text out. Phones run first so their digits are not
 * touched by the year rule.
 */
export function prepareForSpeech(
  displayText: string,
  glossary: ReadonlyArray<GlossaryEntry> = [],
): string {
  return applyYears(
    applyPhones(applyRespellings(applyGlossary(displayText.trim(), glossary))),
  );
}
