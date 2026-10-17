import { CARTESIA_VOICE_API_VERSION } from "./voices-server";

// Speech-to-text for the consent check. Model is configurable because
// provider model names change; verify the default at first use.
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

export async function transcribeClip(wav: Uint8Array): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
    "consent.wav",
  );
  form.append("model", process.env.STUDIO_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL);
  form.append("language", "fr");

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) {
      console.error("Studio: transcription returned", response.status);
      return null;
    }
    const data = (await response.json()) as { text?: string };
    return data.text ?? null;
  } catch (error) {
    console.error("Studio: transcription failed", error);
    return null;
  }
}

export type CloneResult =
  | { ok: true; voiceId: string }
  | { ok: false; status: number };

/** Creates a private cloned voice at Cartesia from a WAV recording. */
export async function createCartesiaClone(input: {
  wav: Uint8Array;
  name: string;
  description: string;
}): Promise<CloneResult> {
  const apiKey = process.env.CARTESIA_CONTENT_KEY;
  if (!apiKey) return { ok: false, status: 503 };

  const form = new FormData();
  form.append(
    "clip",
    new Blob([new Uint8Array(input.wav)], { type: "audio/wav" }),
    "voice.wav",
  );
  form.append("name", input.name.slice(0, 80));
  form.append("description", input.description.slice(0, 300));
  form.append("language", "fr");
  form.append("access", "private");

  try {
    const response = await fetch("https://api.cartesia.ai/voices/clone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Cartesia-Version": CARTESIA_VOICE_API_VERSION,
      },
      body: form,
    });
    if (!response.ok) {
      // Status only: the body may echo request details.
      console.error("Studio: Cartesia clone returned", response.status);
      return { ok: false, status: response.status };
    }
    const data = (await response.json()) as { id?: string };
    return data.id ? { ok: true, voiceId: data.id } : { ok: false, status: 502 };
  } catch (error) {
    console.error("Studio: Cartesia clone failed", error);
    return { ok: false, status: 502 };
  }
}
