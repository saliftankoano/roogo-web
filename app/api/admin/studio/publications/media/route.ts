import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STUDIO_BUCKET } from "@/lib/studio/server";
import { propertyPhotos } from "@/lib/studio/publishing-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// What a post can use for a property: the Studio videos and visuals made for
// it (any project on that property), and the listing's own photos.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const propertyId = new URL(req.url).searchParams.get("propertyId") ?? "";
  if (!propertyId) return errorResponse("Bien manquant", 400, req);

  const { data: conversations } = await supabaseAdmin.from("studio_conversations").select("id").eq("property_id", propertyId);
  const ids = (conversations ?? []).map((c) => c.id);
  const { data: rows } = ids.length
    ? await supabaseAdmin
        .from("studio_artifacts")
        .select("id, kind, title, output_path, created_at")
        .in("conversation_id", ids)
        .in("kind", ["video", "image"])
        .not("output_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(40)
    : { data: [] as Array<{ id: string; kind: string; title: string; output_path: string | null; created_at: string }> };
  const paths = (rows ?? []).map((r) => r.output_path).filter((p): p is string => Boolean(p));
  const { data: signed } = paths.length
    ? await supabaseAdmin.storage.from(STUDIO_BUCKET).createSignedUrls(paths, 3600)
    : { data: [] as Array<{ path: string | null; signedUrl: string }> };
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const artifacts = (rows ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    createdAt: r.created_at,
    url: r.output_path ? byPath.get(r.output_path) ?? null : null,
  }));
  return cors(NextResponse.json({ artifacts, photos: await propertyPhotos(propertyId) }), req);
}
