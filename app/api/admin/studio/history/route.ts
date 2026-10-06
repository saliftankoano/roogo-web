import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STUDIO_BUCKET } from "@/lib/studio/server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const isFounder = staff.user_type === "founder";
  let query = supabaseAdmin
    .from("studio_generations")
    .select(
      "id, user_id, kind, voice, input, est_cost_usd, status, output_path, created_at, users(full_name)",
    )
    .eq("kind", "voiceover")
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(30);
  if (!isFounder) query = query.eq("user_id", staff.id);

  const { data, error } = await query;
  if (error) return errorResponse("Historique indisponible", 500, req);

  const { data: voiceRows } = await supabaseAdmin
    .from("studio_voices")
    .select("key, label");
  const voiceLabels = new Map(
    (voiceRows ?? []).map((v) => [v.key as string, v.label as string]),
  );

  const items = await Promise.all(
    (data ?? []).map(async (row) => {
      const storage = supabaseAdmin.storage.from(STUDIO_BUCKET);
      const voiceLabel = voiceLabels.get(row.voice as string) ?? "Voix";
      const [signed, download] = row.output_path
        ? await Promise.all([
            storage.createSignedUrl(row.output_path, 3600),
            storage.createSignedUrl(row.output_path, 3600, {
              download: `Roogo - Voix off (${voiceLabel}).mp3`,
            }),
          ])
        : [null, null];
      const author = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        id: row.id,
        voice: row.voice,
        voiceLabel,
        text: (row.input as { display_text?: string } | null)?.display_text ?? "",
        costUsd: Number(row.est_cost_usd),
        createdAt: row.created_at,
        author: isFounder ? (author?.full_name ?? null) : null,
        url: signed?.data?.signedUrl ?? null,
        downloadUrl: download?.data?.signedUrl ?? null,
      };
    }),
  );

  return cors(NextResponse.json({ items }), req);
}
