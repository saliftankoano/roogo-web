import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STUDIO_BUCKET } from "@/lib/studio/server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The team's music library: Roogo instrumentals first, then tracks made in the
// Studio, newest first. Links are signed for an hour, for listening only.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const { data: rows, error } = await supabaseAdmin
    .from("studio_music_tracks")
    .select("id, title, source, duration_seconds, storage_path, created_at, users(full_name)")
    .eq("archived", false)
    .order("source", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("Studio: music list failed", error.code);
    return errorResponse("Erreur du Studio", 500, req);
  }

  const storage = supabaseAdmin.storage.from(STUDIO_BUCKET);
  const tracks = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data } = await storage.createSignedUrl(row.storage_path, 3600);
      const author = (Array.isArray(row.users) ? row.users[0] : row.users) as { full_name?: string | null } | null;
      return {
        id: row.id,
        title: row.title,
        source: row.source as "library" | "generated",
        seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
        author: author?.full_name ?? null,
        createdAt: row.created_at,
        url: data?.signedUrl ?? null,
      };
    }),
  );

  // This person's music still being made, so the page can resume waiting for it
  // (the result is saved by the poll that sees it finished).
  const { data: running } = await supabaseAdmin
    .from("studio_generations")
    .select("id, created_at")
    .eq("user_id", staff.id)
    .eq("kind", "music")
    .in("status", ["running", "finalizing"])
    .order("created_at", { ascending: false })
    .limit(1);

  return cors(
    NextResponse.json({
      tracks,
      running: (running ?? []).map((g) => ({ id: g.id, createdAt: g.created_at })),
    }),
    req,
  );
}
