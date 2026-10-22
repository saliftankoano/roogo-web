import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { submitProblems } from "@/lib/studio/publishing";
import {
  PUBLICATION_COLUMNS,
  loadArtifactInfo,
  parsePostInput,
  publicationForArtifact,
  takenSlots,
  toDtos,
  type PublicationRow,
} from "@/lib/studio/publishing-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// "Envoyer à Salif pour validation" from a Studio video: creates the post (or
// fills the visit's planned "Visite commentée", or updates a draft or a post
// Salif sent back) and hands it over for validation in one step.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorResponse("Requête invalide", 400, req);
  const artifactId = typeof body.artifactId === "string" ? body.artifactId : "";
  const artifact = artifactId ? await loadArtifactInfo(artifactId) : null;
  if (!artifact || artifact.kind !== "video" || !artifact.output_path) return errorResponse("Vidéo introuvable", 404, req);

  const { row: existing, cadence } = await publicationForArtifact(artifact.id, artifact.property_id);
  const current = existing ?? cadence;
  if (existing && existing.status !== "a_faire") {
    return errorResponse(
      existing.status === "a_valider" ? "Cette vidéo attend déjà la validation de Salif." : "Cette vidéo est déjà validée ou publiée.",
      409,
      req,
    );
  }

  const { values, error } = await parsePostInput(
    {
      mediaType: "video",
      artifactId: artifact.id,
      caption: body.caption,
      hashtags: Array.isArray(body.hashtags) ? body.hashtags : [],
      networks: body.networks,
      scheduledAt: body.scheduledAt,
    },
    current,
  );
  if (error) return errorResponse(error, 400, req);
  const problems = submitProblems(values.caption);
  if (problems.length) return errorResponse(problems[0].message, 400, req);
  if (!values.networks?.length) return errorResponse("Choisissez au moins un réseau.", 400, req);
  if (!values.scheduled_at || new Date(values.scheduled_at).getTime() <= Date.now()) {
    return errorResponse("Choisissez une date à venir.", 400, req);
  }
  const at = new Date(values.scheduled_at).getTime();
  const taken = await takenSlots(new Date(at - 1000).toISOString(), new Date(at + 1000).toISOString(), current ? [current.id] : []);
  if (taken.length) return errorResponse("Ce créneau vient d'être pris. Choisissez-en un autre.", 409, req);

  const nowIso = new Date().toISOString();
  const model = typeof body.captionModel === "string" ? body.captionModel.slice(0, 60) : null;
  const update = {
    ...values,
    property_id: artifact.property_id ?? current?.property_id ?? null,
    status: "a_valider",
    approved_by: null,
    approved_at: null,
    caption_model: model,
    caption_generated_at: model ? isoOrNull(body.captionGeneratedAt) : null,
    caption_edited_by: staff.id,
    caption_edited_at: nowIso,
    submitted_by: staff.id,
    submitted_at: nowIso,
    returned_at: null,
    returned_by: null,
    last_error: null,
    updated_at: nowIso,
  };

  let saved: PublicationRow | null = null;
  if (current) {
    const { data, error: updateError } = await supabaseAdmin
      .from("studio_publications")
      .update(update)
      .eq("id", current.id)
      .eq("status", "a_faire")
      .is("claimed_at", null)
      .select(PUBLICATION_COLUMNS);
    if (updateError) {
      console.error("Studio propose: update failed", updateError.code);
      return errorResponse("Envoi impossible", 500, req);
    }
    saved = (data?.[0] as PublicationRow | undefined) ?? null;
    if (!saved) return errorResponse("La publication a changé entre-temps. Rechargez la page.", 409, req);
  } else {
    const { data, error: insertError } = await supabaseAdmin
      .from("studio_publications")
      .insert({
        ...update,
        title: (artifact.text || "").trim().slice(0, 120) || "Vidéo du bien",
        assignee_id: staff.id,
        created_by: staff.id,
      })
      .select(PUBLICATION_COLUMNS)
      .single();
    if (insertError || !data) {
      console.error("Studio propose: insert failed", insertError?.code);
      return errorResponse("Envoi impossible", 500, req);
    }
    saved = data as PublicationRow;
  }
  const [post] = await toDtos([saved]);
  return cors(NextResponse.json({ post }), req);
}
