// Approved Cartesia voices for the content Studio. The API accepts a key, never
// a raw voice ID, so no other voice can be used from the web app.
// Source: roogo-skills/skills/video-avantage/references/cartesia.md.
// Salif authorized staff use of his own French voice here on 2026-10-05.
// His English voice and any other voice are deliberately excluded.

export const STUDIO_TTS_MODEL = "sonic-3.5";
export const STUDIO_LANGUAGE = "fr";

export const STUDIO_VOICES = {
  sandrine: {
    label: "Sandrine",
    description: "Voix par défaut de Roogo",
    id: "2435841c-fce7-4fd5-aed1-dc7008eb7d20",
  },
  salif: {
    label: "Voix de Salif",
    description: "Salif en français",
    id: "16dba105-0026-4ff7-bf90-12562786a97c",
  },
} as const;

export type StudioVoiceKey = keyof typeof STUDIO_VOICES;

export const DEFAULT_STUDIO_VOICE: StudioVoiceKey = "sandrine";

export function isStudioVoiceKey(value: unknown): value is StudioVoiceKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(STUDIO_VOICES, value)
  );
}
