import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { renderStatus } from "@/lib/studio/heygen-server";
import { STUDIO_BUCKET } from "@/lib/studio/server";

export const maxDuration = 60;

// A render that never finishes must not stay "running" against the video budget.
const MAX_RENDER_MINUTES = 15;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type Ctx = { params: Promise<{ id: string }> };

// The editor polls this. The first poll that sees HeyGen's render completed claims
// it ("finalizing"), copies the MP4 into our bucket once, and answers done.
export async function GET(req: Request, { params }: Ctx) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const { data: gen } = await supabaseAdmin
    .from("studio_generations")
    .select("id, user_id, status, input, conversation_id, created_at, error, provider_request_id")
    .eq("id", id)
    .eq("user_id", staff.id)
    .eq("kind", "video")
    .maybeSingle();
  if (!gen) return errorResponse("Rendu introuvable", 404, req);
  const respond = (body: Record<string, unknown>) => cors(NextResponse.json(body), req);

  if (gen.status === "done") {
    const { data: artifact } = await supabaseAdmin.from("studio_artifacts").select("id").eq("generation_id", gen.id).maybeSingle();
    return respond({ state: "done", artifactId: artifact?.id ?? null });
  }
  if (gen.status === "failed") return respond({ state: "failed", error: gen.error ?? "Le rendu a échoué." });

  const failRender = async (message: string, matchStatus: "running" | "finalizing" = "running") => {
    await supabaseAdmin
      .from("studio_generations")
      .update({ status: "failed", error: message.slice(0, 300) })
      .eq("id", gen.id)
      .eq("status", matchStatus);
    return respond({ state: "failed", error: message });
  };

  if (gen.status === "finalizing" || !gen.provider_request_id) return respond({ state: "running" });
  const ageMinutes = (Date.now() - new Date(gen.created_at).getTime()) / 60_000;
  if (ageMinutes > MAX_RENDER_MINUTES) return failRender("Le rendu a pris trop de temps. Réessayez.");

  const status = await renderStatus(gen.provider_request_id);
  if (status.state === "failed") return failRender(`Le rendu a échoué : ${status.message}`);
  if (status.state === "running") return respond({ state: "running" });

  const { data: claimed } = await supabaseAdmin
    .from("studio_generations")
    .update({ status: "finalizing" })
    .eq("id", gen.id)
    .eq("status", "running")
    .select("id");
  if (!claimed?.length) return respond({ state: "running" });

  let video: Buffer;
  try {
    const res = await fetch(status.videoUrl);
    if (!res.ok) return failRender("La vidéo n'a pas pu être téléchargée.", "finalizing");
    video = Buffer.from(await res.arrayBuffer());
    if (!video.length || video.length > MAX_VIDEO_BYTES) return failRender("La vidéo reçue est invalide.", "finalizing");
  } catch {
    return failRender("La vidéo n'a pas pu être téléchargée.", "finalizing");
  }

  const path = `${gen.user_id}/${randomUUID()}.mp4`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(STUDIO_BUCKET)
    .upload(path, video, { contentType: "video/mp4", upsert: false });
  if (uploadError) {
    console.error("Studio: video upload failed", uploadError.message);
    return failRender("La vidéo n'a pas pu être conservée.", "finalizing");
  }

  const input = (gen.input ?? {}) as { mode?: string; title?: string; seconds?: number; render_id?: string };
  const { data: inserted } = await supabaseAdmin
    .from("studio_artifacts")
    .insert({
      conversation_id: gen.conversation_id,
      kind: "video",
      title: input.mode === "outro" ? "Fin seule" : "Vidéo du bien (Visite POV)",
      text: input.title ?? "",
      generation_id: gen.id,
      output_path: path,
      pinned: true,
      meta: {
        mode: input.mode ?? "full",
        duration_seconds: status.durationSeconds ?? input.seconds ?? null,
        render_id: input.render_id ?? gen.provider_request_id,
        bytes: video.length,
      },
    })
    .select("id")
    .single();
  if (!inserted) return failRender("La vidéo n'a pas pu être enregistrée.", "finalizing");

  await supabaseAdmin.from("studio_generations").update({ status: "done" }).eq("id", gen.id);
  return respond({ state: "done", artifactId: inserted.id });
}
