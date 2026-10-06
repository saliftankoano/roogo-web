// Rules for Studio voices. Pure functions, mirrored by the database
// functions in migration 077 (the database is the final guard).
// Voices live in public.studio_voices. The API accepts a voice key from that
// table, never a raw Cartesia voice id.

export const STUDIO_TTS_MODEL = "sonic-3.5";
export const STUDIO_LANGUAGE = "fr";

export type StudioVoiceStatus = "active" | "locked" | "pending" | "revoked";
export type StudioVoiceKind = "system" | "cloned";

export type StudioVoice = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  cartesiaVoiceId: string;
  kind: StudioVoiceKind;
  ownerUserId: string | null;
  status: StudioVoiceStatus;
};

type Viewer = { id: string; user_type: string | null };

/** Only an active voice can speak. Locked, pending and revoked cannot. */
export function isVoiceUsable(voice: Pick<StudioVoice, "status">): boolean {
  return voice.status === "active";
}

/** The owner of a locked voice unlocks it by accepting the terms. */
export function canAcceptVoiceTerms(
  viewer: Viewer,
  voice: Pick<StudioVoice, "ownerUserId" | "status">,
): boolean {
  return voice.status === "locked" && voice.ownerUserId === viewer.id;
}

/** The owner or a founder can withdraw a voice that is not already revoked. */
export function canRevokeVoice(
  viewer: Viewer,
  voice: Pick<StudioVoice, "ownerUserId" | "status">,
): boolean {
  if (voice.status === "revoked") return false;
  return viewer.user_type === "founder" || voice.ownerUserId === viewer.id;
}

/**
 * One voice per person. A person who already owns a voice that is not
 * revoked cannot get another one: they must revoke it first.
 */
export function canOwnAnotherVoice(
  ownerUserId: string,
  voices: ReadonlyArray<Pick<StudioVoice, "ownerUserId" | "status">>,
): boolean {
  return !voices.some(
    (voice) => voice.ownerUserId === ownerUserId && voice.status !== "revoked",
  );
}

/** What the viewer sees in the voice list: usable voices plus their own. */
export function visibleVoices<T extends StudioVoice>(
  viewer: Viewer,
  voices: ReadonlyArray<T>,
): T[] {
  return voices.filter(
    (voice) =>
      isVoiceUsable(voice) ||
      (voice.ownerUserId === viewer.id && voice.status !== "revoked"),
  );
}

export const DEFAULT_STUDIO_VOICE_KEY = "sandrine";
