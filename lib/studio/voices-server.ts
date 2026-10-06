import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { termsFullText, TERMS_VERSION } from "./consent-terms";
import type { StudioVoice } from "./voices";

type VoiceRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  cartesia_voice_id: string;
  kind: "system" | "cloned";
  owner_user_id: string | null;
  status: "active" | "locked" | "pending" | "revoked";
};

const COLUMNS =
  "id, key, label, description, cartesia_voice_id, kind, owner_user_id, status";

function toVoice(row: VoiceRow): StudioVoice {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    cartesiaVoiceId: row.cartesia_voice_id,
    kind: row.kind,
    ownerUserId: row.owner_user_id,
    status: row.status,
  };
}

export async function loadVoices(): Promise<StudioVoice[]> {
  const { data } = await supabaseAdmin
    .from("studio_voices")
    .select(COLUMNS)
    .neq("status", "revoked")
    .order("created_at", { ascending: true });
  return ((data ?? []) as VoiceRow[]).map(toVoice);
}

export async function loadVoiceByKey(key: string): Promise<StudioVoice | null> {
  const { data } = await supabaseAdmin
    .from("studio_voices")
    .select(COLUMNS)
    .eq("key", key)
    .maybeSingle();
  return data ? toVoice(data as VoiceRow) : null;
}

export async function loadVoiceById(id: string): Promise<StudioVoice | null> {
  const { data } = await supabaseAdmin
    .from("studio_voices")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data ? toVoice(data as VoiceRow) : null;
}

export function currentTermsHash(): string {
  return createHash("sha256").update(termsFullText()).digest("hex");
}

export const CURRENT_TERMS_VERSION = TERMS_VERSION;

// Cartesia calls that manage voices use the documented bearer auth and the
// current API version. (The TTS call in the voiceover route keeps the shape
// that was verified against the live API on 2026-10-06.)
export const CARTESIA_VOICE_API_VERSION = "2026-08-14";

/** Deletes a cloned voice at Cartesia. Returns true when it is gone. */
export async function deleteCartesiaVoice(
  cartesiaVoiceId: string,
): Promise<boolean> {
  const apiKey = process.env.CARTESIA_CONTENT_KEY;
  if (!apiKey) return false;
  try {
    const response = await fetch(
      `https://api.cartesia.ai/voices/${encodeURIComponent(cartesiaVoiceId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Cartesia-Version": CARTESIA_VOICE_API_VERSION,
        },
      },
    );
    // 404 means it is already gone, which is the outcome we want.
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}
