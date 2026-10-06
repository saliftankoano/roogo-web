import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { checkRateLimit, studioCloneLimiter } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createCartesiaClone, transcribeClip } from "@/lib/studio/clone-server";
import { matchChallenge } from "@/lib/studio/consent";
import { canOwnAnotherVoice } from "@/lib/studio/voices";
import {
  CURRENT_TERMS_VERSION,
  currentTermsHash,
  deleteCartesiaVoice,
  loadVoices,
} from "@/lib/studio/voices-server";
import {
  MAX_CLONE_SECONDS,
  MIN_CLONE_SECONDS,
  readWavInfo,
} from "@/lib/studio/wav";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const SAMPLE_BUCKET = "voice-consents";

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

function slug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "staff"
  );
}

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Creates the person's own voice from a recording in which they read the
// challenge sentence. One voice per person: refused if they already own one.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const limit = await checkRateLimit(studioCloneLimiter, staff.id);
  if (!limit.success) {
    return errorResponse("Trop d'essais aujourd'hui. Réessayez demain.", 429, req);
  }

  const form = await req.formData().catch(() => null);
  const clip = form?.get("clip");
  const challengeId = form?.get("challenge_id");
  if (!(clip instanceof File) || typeof challengeId !== "string") {
    return errorResponse("Enregistrement manquant.", 400, req);
  }
  if (form?.get("accepted") !== "true") {
    return errorResponse("Vous devez accepter les conditions.", 400, req);
  }
  if (form?.get("terms_version") !== CURRENT_TERMS_VERSION) {
    return errorResponse(
      "Les conditions ont changé. Rechargez la page et relisez-les.",
      409,
      req,
    );
  }
  if (clip.size === 0 || clip.size > MAX_BYTES) {
    return errorResponse("L'enregistrement est trop volumineux.", 400, req);
  }

  const wav = new Uint8Array(await clip.arrayBuffer());
  const info = readWavInfo(wav);
  if (!info) return errorResponse("Format d'enregistrement non reconnu.", 400, req);
  if (
    info.durationSeconds < MIN_CLONE_SECONDS - 0.5 ||
    info.durationSeconds > MAX_CLONE_SECONDS + 1
  ) {
    return errorResponse(
      `L'enregistrement doit durer entre ${MIN_CLONE_SECONDS} et ${MAX_CLONE_SECONDS} secondes.`,
      400,
      req,
    );
  }

  // One voice per person, checked here and enforced again by the database.
  const voices = await loadVoices();
  if (!canOwnAnotherVoice(staff.id, voices)) {
    return errorResponse(
      "Vous avez déjà une voix. Retirez-la d'abord pour en créer une nouvelle.",
      409,
      req,
    );
  }
  // A removed clone must be gone at Cartesia before a new one is made.
  const { data: oldClones } = await supabaseAdmin
    .from("studio_voices")
    .select("id")
    .eq("owner_user_id", staff.id)
    .eq("kind", "cloned")
    .eq("status", "revoked");
  if (oldClones?.length) {
    const { count } = await supabaseAdmin
      .from("studio_voice_consents")
      .select("id", { count: "exact", head: true })
      .in("voice_id", oldClones.map((v) => v.id))
      .is("cartesia_deleted_at", null);
    if ((count ?? 0) > 0) {
      return errorResponse(
        "Votre ancienne voix est en cours de suppression. Réessayez plus tard.",
        409,
        req,
      );
    }
  }

  // Claim the challenge: it must be ours, unexpired and unused. Claiming it
  // is atomic, so one challenge can never be used twice.
  const { data: challenge } = await supabaseAdmin
    .from("studio_voice_challenges")
    .select("id, sentence, code, expires_at")
    .eq("id", challengeId)
    .eq("user_id", staff.id)
    .is("used_at", null)
    .maybeSingle();
  if (!challenge || new Date(challenge.expires_at) < new Date()) {
    return errorResponse("Le défi a expiré. Recommencez.", 409, req);
  }
  const { data: claimed } = await supabaseAdmin
    .from("studio_voice_challenges")
    .update({ used_at: new Date().toISOString() })
    .eq("id", challenge.id)
    .is("used_at", null)
    .select("id");
  if (!claimed?.length) {
    return errorResponse("Le défi a déjà été utilisé. Recommencez.", 409, req);
  }

  const transcript = await transcribeClip(wav);
  if (transcript === null) {
    return errorResponse("La vérification n'a pas pu être faite. Réessayez.", 502, req);
  }
  const match = matchChallenge(transcript, challenge.sentence, challenge.code);
  if (!match.ok) {
    return errorResponse(
      "Nous n'avons pas reconnu la phrase lue. Lisez-la exactement, avec le code, puis recommencez.",
      422,
      req,
    );
  }

  const sha256 = createHash("sha256").update(wav).digest("hex");
  const samplePath = `${staff.id}/${challenge.id}.wav`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(SAMPLE_BUCKET)
    .upload(samplePath, wav, { contentType: "audio/wav", upsert: false });
  if (uploadError) {
    console.error("Studio: consent sample upload failed", uploadError.message);
    return errorResponse("L'enregistrement n'a pas pu être conservé.", 500, req);
  }

  const fullName = (staff.full_name ?? "").trim();
  const firstName = fullName.split(/\s+/)[0] || "Équipe";
  const key = `voix-${slug(firstName)}-${randomBytes(2).toString("hex")}`;

  // The pending row holds the person's single voice slot while we work.
  const { data: voice, error: voiceError } = await supabaseAdmin
    .from("studio_voices")
    .insert({
      key,
      label: `Voix de ${firstName}`,
      description: "Voix clonée dans le Studio",
      cartesia_voice_id: "pending",
      kind: "cloned",
      owner_user_id: staff.id,
      status: "pending",
    })
    .select("id")
    .single();
  if (voiceError || !voice) {
    // 23505 = the one-voice-per-person index refused a second voice.
    if (voiceError?.code === "23505") {
      return errorResponse("Vous avez déjà une voix.", 409, req);
    }
    console.error("Studio: voice insert failed", voiceError?.code);
    return errorResponse("La voix n'a pas pu être créée.", 500, req);
  }

  const { data: consent, error: consentError } = await supabaseAdmin
    .from("studio_voice_consents")
    .insert({
      voice_id: voice.id,
      user_id: staff.id,
      terms_version: CURRENT_TERMS_VERSION,
      terms_text_hash: currentTermsHash(),
      method: "read_aloud",
      challenge_sentence: challenge.sentence,
      challenge_transcript: transcript.slice(0, 2000),
      match_score: match.score,
      sample_sha256: sha256,
      sample_path: samplePath,
      ip: clientIp(req),
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    })
    .select("id")
    .single();
  if (consentError || !consent) {
    await supabaseAdmin
      .from("studio_voices")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoke_reason: "Consentement non enregistré",
      })
      .eq("id", voice.id);
    return errorResponse("Le consentement n'a pas pu être enregistré.", 500, req);
  }

  const cloned = await createCartesiaClone({
    wav,
    name: `Studio - ${fullName || firstName}`,
    description: `Cloned in Roogo Studio. Consent record ${consent.id}.`,
  });
  if (!cloned.ok) {
    // Free the slot and keep the audit trail.
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("studio_voices")
      .update({ status: "revoked", revoked_at: now, revoke_reason: "Clonage échoué" })
      .eq("id", voice.id);
    await supabaseAdmin
      .from("studio_voice_consents")
      .update({ revoked_at: now, revoke_reason: "Clonage échoué", cartesia_deleted_at: now })
      .eq("id", consent.id);
    return errorResponse("La voix n'a pas pu être créée. Réessayez.", 502, req);
  }

  const { error: activateError } = await supabaseAdmin
    .from("studio_voices")
    .update({
      cartesia_voice_id: cloned.voiceId,
      status: "active",
      consent_id: consent.id,
    })
    .eq("id", voice.id);
  if (activateError) {
    console.error("Studio: voice activation failed", activateError.code);
    // Do not leave an orphan clone at Cartesia: remove it and free the slot.
    const removed = await deleteCartesiaVoice(cloned.voiceId);
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("studio_voices")
      .update({ status: "revoked", revoked_at: now, revoke_reason: "Activation échouée" })
      .eq("id", voice.id);
    await supabaseAdmin
      .from("studio_voice_consents")
      .update({
        revoked_at: now,
        revoke_reason: "Activation échouée",
        cartesia_deleted_at: removed ? now : null,
      })
      .eq("id", consent.id);
    return errorResponse("La voix n'a pas pu être activée. Réessayez.", 500, req);
  }

  return cors(
    NextResponse.json({ ok: true, voice: { key, label: `Voix de ${firstName}` } }, { status: 201 }),
    req,
  );
}
