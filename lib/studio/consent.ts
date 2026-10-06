// Read-aloud consent check for voice cloning.
// The person reads a fresh sentence (their name, today's date and a 4-digit
// code) at the start of the recording. The server transcribes the clip and
// checks it. This proves the clip is fresh and was read by someone who saw
// the sentence. It does not prove identity beyond the signed-in account.

export const CHALLENGE_TTL_MINUTES = 10;
export const MATCH_THRESHOLD = 0.75;

const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  un: "1",
  une: "1",
  deux: "2",
  trois: "3",
  quatre: "4",
  cinq: "5",
  six: "6",
  sept: "7",
  huit: "8",
  neuf: "9",
};

export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 4; i += 1) code += String(Math.floor(random() * 10));
  return code;
}

const FRENCH_DIGITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];

export function codeAsWords(code: string): string {
  return code
    .split("")
    .map((digit) => FRENCH_DIGITS[Number(digit)])
    .join(", ");
}

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function frenchDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function buildChallengeSentence(
  fullName: string,
  code: string,
  date: Date,
): string {
  const name = fullName.trim() || "la personne qui enregistre";
  return `Je m'appelle ${name}. J'autorise Kazedra Tech à créer une voix numérique à partir de ma voix, le ${frenchDate(date)}. Mon code est ${codeAsWords(code)}.`;
}

/** Digits heard in the transcript, whether written as 4 8 2 1 or in words. */
export function extractDigits(transcript: string): string {
  let digits = "";
  for (const token of normalizeForMatch(transcript).split(" ")) {
    if (/^[0-9]+$/.test(token)) digits += token;
    else if (DIGIT_WORDS[token] !== undefined) digits += DIGIT_WORDS[token];
  }
  return digits;
}

export type MatchResult = {
  ok: boolean;
  score: number;
  codeFound: boolean;
};

/**
 * The code must be heard exactly, and enough of the sentence's words must
 * appear in the transcript (a bag of words, so small recognition slips and
 * word order do not fail an honest reading).
 */
export function matchChallenge(
  transcript: string,
  sentence: string,
  code: string,
): MatchResult {
  const codeFound = extractDigits(transcript).includes(code);

  const heard = new Set(normalizeForMatch(transcript).split(" "));
  const expected = normalizeForMatch(sentence)
    .split(" ")
    // The spoken digits are judged by the code check, not by word overlap.
    .filter((word) => word && DIGIT_WORDS[word] === undefined);
  const found = expected.filter((word) => heard.has(word)).length;
  const score = expected.length ? found / expected.length : 0;

  return {
    ok: codeFound && score >= MATCH_THRESHOLD,
    score: Math.round(score * 1000) / 1000,
    codeFound,
  };
}

// A natural paragraph read after the sentence, so the clone hears normal
// speech and the clip reaches the length Cartesia asks for.
export const READ_ALOUD_PARAGRAPH =
  "Bonjour, je vous présente une belle maison à louer à Ouagadougou. Elle est calme, lumineuse et bien placée, près des commerces et des écoles. Si elle vous intéresse, vous pouvez la visiter dès cette semaine. Nous répondons à toutes vos questions avec plaisir, et nous restons disponibles pour vous accompagner à chaque étape.";
