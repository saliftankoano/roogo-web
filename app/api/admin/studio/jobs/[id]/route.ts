import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { falStatus } from "@/lib/studio/fal-server";
import { finishJob } from "@/lib/studio/jobs-server";

export const maxDuration = 60;

// A job that never completes must not stay "running" (and counted against the
// cap) forever.
const MAX_JOB_MINUTES = 10;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type Ctx = { params: Promise<{ id: string }> };

// The page polls this every few seconds. The first poll that sees fal's job
// completed claims it ("finalizing"), saves the result once, and answers done.
export async function GET(req: Request, { params }: Ctx) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const { id } = await params;
  const { data: gen } = await supabaseAdmin
    .from("studio_generations")
    .select("id, user_id, kind, status, input, conversation_id, created_at, error")
    .eq("id", id)
    .eq("user_id", staff.id)
    .in("kind", ["image", "transcription", "music"])
    .maybeSingle();
  if (!gen) return errorResponse("Tâche introuvable", 404, req);

  const respond = (body: Record<string, unknown>) => cors(NextResponse.json(body), req);

  if (gen.status === "done" && gen.kind === "music") {
    const { data: track } = await supabaseAdmin
      .from("studio_music_tracks")
      .select("id")
      .eq("generation_id", gen.id)
      .maybeSingle();
    return respond({ state: "done", artifactId: track?.id ?? null });
  }
  if (gen.status === "done") {
    const { data: artifact } = await supabaseAdmin
      .from("studio_artifacts")
      .select("id")
      .eq("generation_id", gen.id)
      .maybeSingle();
    return respond({ state: "done", artifactId: artifact?.id ?? null });
  }
  if (gen.status === "failed") {
    return respond({ state: "failed", error: gen.error ?? "La création a échoué." });
  }

  const failJob = async (message: string, matchStatus: "running" | "finalizing" = "running") => {
    await supabaseAdmin
      .from("studio_generations")
      .update({ status: "failed", error: message.slice(0, 300) })
      .eq("id", gen.id)
      .eq("status", matchStatus);
    return respond({ state: "failed", error: message });
  };

  if (gen.status === "finalizing") return respond({ state: "running" });

  const urls = gen.input as { status_url?: string; response_url?: string } | null;
  if (!urls?.status_url || !urls.response_url) return respond({ state: "running" });

  const ageMinutes = (Date.now() - new Date(gen.created_at).getTime()) / 60_000;
  if (ageMinutes > MAX_JOB_MINUTES) {
    return failJob("La création a pris trop de temps. Réessayez.");
  }

  const status = await falStatus(urls.status_url);
  if (status.state === "FAILED" || status.state === "CANCELED") {
    return failJob("La création a échoué côté fal.");
  }
  if (status.state !== "COMPLETED") {
    return respond({ state: "running", queuePosition: status.queuePosition });
  }

  // Claim the right to save the result. Only one poll can win this update.
  const { data: claimed } = await supabaseAdmin
    .from("studio_generations")
    .update({ status: "finalizing" })
    .eq("id", gen.id)
    .eq("status", "running")
    .select("id");
  if (!claimed?.length) return respond({ state: "running" });

  const finished = await finishJob(
    {
      id: gen.id,
      user_id: gen.user_id,
      input: gen.input as Record<string, unknown> | null,
      conversation_id: gen.conversation_id,
    },
    urls.response_url,
  );
  if (!finished.ok) return failJob(finished.error, "finalizing");

  await supabaseAdmin.from("studio_generations").update({ status: "done" }).eq("id", gen.id);
  return respond({ state: "done", artifactId: finished.artifactId });
}
