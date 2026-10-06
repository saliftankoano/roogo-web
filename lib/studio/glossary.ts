// Rules for the team-shared pronunciation glossary.

export const MAX_GLOSSARY_ENTRIES = 500;
export const MAX_TERM_LENGTH = 60;
export const MAX_SPOKEN_LENGTH = 120;

export type GlossaryInput = { term: string; spoken: string };

export function validateGlossaryEntry(
  input: { term?: unknown; spoken?: unknown },
):
  | { ok: true; value: GlossaryInput }
  | { ok: false; error: string } {
  const term = typeof input.term === "string" ? input.term.trim() : "";
  const spoken = typeof input.spoken === "string" ? input.spoken.trim() : "";

  if (!term) return { ok: false, error: "Indiquez le mot à corriger." };
  if (!spoken) return { ok: false, error: "Indiquez comment le prononcer." };
  if (term.length > MAX_TERM_LENGTH) {
    return { ok: false, error: `Le mot est trop long (${MAX_TERM_LENGTH} caractères au maximum).` };
  }
  if (spoken.length > MAX_SPOKEN_LENGTH) {
    return { ok: false, error: `La prononciation est trop longue (${MAX_SPOKEN_LENGTH} caractères au maximum).` };
  }
  if (term.toLowerCase() === spoken.toLowerCase()) {
    return { ok: false, error: "La prononciation doit être différente du mot." };
  }
  if (/[—\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(`${term}${spoken}`)) {
    return { ok: false, error: "Pas de tiret long ni d'emoji." };
  }
  return { ok: true, value: { term, spoken } };
}

/** Anyone can remove their own entries; only a founder can remove others'. */
export function canDeleteGlossaryEntry(
  viewer: { id: string; user_type: string | null },
  entry: { created_by: string | null },
): boolean {
  if (viewer.user_type === "founder") return true;
  return entry.created_by !== null && entry.created_by === viewer.id;
}
