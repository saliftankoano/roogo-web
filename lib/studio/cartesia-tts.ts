import { STUDIO_LANGUAGE, STUDIO_TTS_MODEL } from "./voices";

// One place for the Cartesia speech call. The request shape (version header,
// auth header, model, voice object) was verified against the live API on
// 2026-10-06; both the newer and this older shape return audio.

export type SpeechResult =
  | { ok: true; audio: Buffer }
  | { ok: false; status: number };

export async function synthesizeSpeech(input: {
  apiKey: string;
  cartesiaVoiceId: string;
  text: string;
}): Promise<SpeechResult> {
  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cartesia-Version": "2025-04-16",
      "X-API-Key": input.apiKey,
    },
    body: JSON.stringify({
      model_id: STUDIO_TTS_MODEL,
      transcript: input.text,
      voice: { mode: "id", id: input.cartesiaVoiceId },
      language: STUDIO_LANGUAGE,
      output_format: {
        container: "mp3",
        sample_rate: 44100,
        bit_rate: 128000,
      },
    }),
  });

  if (!response.ok) {
    // Status only: the body may echo request details.
    return { ok: false, status: response.status };
  }
  return { ok: true, audio: Buffer.from(await response.arrayBuffer()) };
}
