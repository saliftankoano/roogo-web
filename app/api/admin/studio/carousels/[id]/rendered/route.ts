import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canWriteConversation, loadConversation } from "@/lib/studio/conversations-server";
import type { CarouselMeta } from "@/lib/studio/carousel";
import { carouselView, existingSlides, loadCarousel, removeOldSlides, sendApprovedPostsBack } from "@/lib/studio/carousel-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type Ctx = { params: Promise<{ id: string }> };

// The browser finished uploading the slides of a render version: checks every
// slide is really in the bucket, makes that version current, removes the old
// ones, and sends an approved post back to "à valider" (content changed).
export async function POST(req: Request, { params }: Ctx) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const found = await loadCarousel(id);
  const conv = found ? await loadConversation(found.row.conversation_id) : null;
  if (!found || !conv || !canWriteConversation(staff, conv)) return errorResponse("Carrousel introuvable", 404, req);

  const body = (await req.json().catch(() => null)) as { version?: unknown } | null;
  const version = String(body?.version ?? "");
  if (!version || version !== found.meta.pending_version) return errorResponse("Ce rendu n'est plus le dernier. Enregistrez à nouveau.", 409, req);

  const slides = await existingSlides(id, version, found.meta.spec.slides.length);
  if (!slides) return errorResponse("Des slides manquent. Enregistrez à nouveau.", 409, req);

  const meta: CarouselMeta = { ...found.meta, slides, version, rendered_at: new Date().toISOString(), pending_version: null };
  const { error } = await supabaseAdmin.from("studio_artifacts").update({ meta, output_path: slides[0] }).eq("id", id);
  if (error) return errorResponse("Enregistrement impossible", 500, req);
  await supabaseAdmin.from("studio_conversations").update({ updated_at: new Date().toISOString() }).eq("id", found.row.conversation_id);

  const sentBack = await sendApprovedPostsBack(id);
  await removeOldSlides(id, version);
  return cors(NextResponse.json({ ...(await carouselView(id, meta)), sentBack }), req);
}
