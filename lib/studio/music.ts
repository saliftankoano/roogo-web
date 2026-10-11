// Music for Studio videos (Salif, 2026-10-11). Pure, so it can be tested.
//
// Prompt and title for generated tracks. The model and its price are in
// ai-tools.ts; the music's level over the video is in video-templates.ts.

export const MUSIC_MOODS = [
  { key: "joyful", label: "Joyeuse", words: "warm, joyful and bright" },
  { key: "calm", label: "Calme", words: "calm, soft and relaxing" },
  { key: "afro", label: "Afro", words: "light modern Afro-pop groove with acoustic guitar, balafon and gentle percussion" },
  { key: "elegant", label: "Élégante", words: "elegant and premium, piano and soft strings" },
  { key: "energetic", label: "Énergique", words: "energetic and upbeat, driving rhythm" },
] as const;

export type MusicMood = (typeof MUSIC_MOODS)[number]["key"];

export function isMusicMood(value: unknown): value is MusicMood {
  return MUSIC_MOODS.some((mood) => mood.key === value);
}

/**
 * The prompt sent to the model. Always instrumental: Lyria has no switch for
 * it, so the prompt asks for it several ways.
 */
export function buildMusicPrompt(mood: MusicMood | null, details: string): string {
  const words = MUSIC_MOODS.find((m) => m.key === mood)?.words;
  const extra = details.replace(/\s+/g, " ").trim().slice(0, 240);
  return [
    "Instrumental background music for a real estate video in Burkina Faso.",
    words ? `Mood: ${words}.` : null,
    extra ? `${extra}.` : null,
    "No vocals, no singing, no lyrics, no voice.",
    "Steady energy, clean modern mix, about 90 seconds, with a gentle ending.",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\.\./g, ".");
}

/** A short title for a generated track, from its mood and details. */
export function generatedTitle(mood: MusicMood | null, details: string): string {
  const label = MUSIC_MOODS.find((m) => m.key === mood)?.label;
  const text = details.replace(/\s+/g, " ").trim();
  const short = text.length > 40 ? `${text.slice(0, 40).replace(/\s+\S*$/, "")}…` : text;
  const title = [label, short].filter(Boolean).join(", ");
  return title ? title.charAt(0).toUpperCase() + title.slice(1) : "Musique générée";
}
