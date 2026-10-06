// Feature switches for the Studio. Voice cloning stays off until Salif turns
// it on (after the consent text is reviewed and the Cartesia plan, training
// opt-out and deletion behavior are confirmed).

export function isVoiceCloningEnabled(
  value: string | undefined = process.env.STUDIO_VOICE_CLONING_ENABLED,
): boolean {
  return value?.trim().toLowerCase() === "true";
}
