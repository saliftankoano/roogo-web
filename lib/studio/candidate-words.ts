// Finds words in a script that are likely to be mispronounced by the voice
// (place names, surnames, acronyms) and are not in the glossary yet, so the
// Studio can offer to add them in one tap.

// Capitalized words that are normal French and need no glossary entry.
const COMMON_CAPITALIZED = new Set([
  "bienvenue",
  "bonjour",
  "merci",
  "appelez",
  "ecrivez",
  "écrivez",
  "whatsapp",
  "voici",
  "cette",
  "dans",
  "pour",
  "avec",
  "sans",
  "chez",
  "nous",
  "vous",
  "les",
  "des",
  "une",
  "ici",
  "sur",
]);

const WORD = /[\p{L}][\p{L}'’-]*[\p{L}]|[\p{L}]/gu;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function findCandidateWords(
  text: string,
  knownTerms: ReadonlyArray<string>,
  limit = 8,
): string[] {
  const known = new Set(knownTerms.map(normalize));
  const found = new Map<string, string>();

  // Split into sentences so the first word of a sentence, which is always
  // capitalized, is not mistaken for a name.
  const sentences = text.split(/(?<=[.!?…])\s+|\n+/);
  for (const sentence of sentences) {
    const words = sentence.match(WORD) ?? [];
    words.forEach((word, index) => {
      if (word.length < 3) return;
      const first = word[0];
      const isCapitalized = first !== first.toLowerCase();
      const isAcronym = word.length <= 6 && word === word.toUpperCase();
      if (!isCapitalized && !isAcronym) return;
      if (index === 0 && !isAcronym) return;
      const key = normalize(word);
      if (known.has(key) || COMMON_CAPITALIZED.has(key)) return;
      if (!found.has(key)) found.set(key, word);
    });
  }

  return [...found.values()].slice(0, limit);
}
