import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canReadConversation, canWriteConversation, loadConversation } from "@/lib/studio/conversations-server";
import { carouselPaths, type CarouselMeta } from "@/lib/studio/carousel";
import { carouselView, checkSpec, loadCarousel, photoProblems, uploadUrl } from "@/lib/studio/carousel-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type Ctx = { params: Promise<{ id: string }> };

async function access(req: Request, id: string, write: boolean) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return { error: errorResponse("Forbidden", 403, req) } as const;
  const found = await loadCarousel(id);
  const conv = found ? await loadConversation(found.row.conversation_id) : null;
  if (!found || !conv || !(write ? canWriteConversation(staff, conv) : canReadConversation(staff, conv))) {
    return { error: errorResponse("Carrousel introuvable", 404, req) } as const;
  }
  return { found } as const;
}

// The carousel as the editor needs it: the spec, signed URLs for its photos
// (used ones and the rest of its folder) and the current rendered slides.
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const a = await access(req, id, false);
  if ("error" in a) return a.error;
  return cors(NextResponse.json(await carouselView(id, a.found.meta)), req);
}

// "Enregistrer": saves the edited spec (text, photo choice, framing,
// darkening) and returns one upload URL per slide for a new render version.
// The current slides stay in place until /rendered confirms the new ones.
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const a = await access(req, id, true);
  if ("error" in a) return a.error;
  const body = (await req.json().catch(() => null)) as { spec?: unknown } | null;
  const { spec, problems, blocking } = checkSpec(body?.spec);
  if (!spec || blocking.length) return cors(NextResponse.json({ error: blocking[0]?.message ?? "Carrousel invalide", problems }, { status: 400 }), req);
  const photos = photoProblems(id, spec, a.found.meta.spec);
  if (photos.length) return errorResponse(photos[0].message, 400, req);

  const version = `v${Date.now().toString(36)}`;
  const meta: CarouselMeta = { ...a.found.meta, spec, pending_version: version };
  const { error } = await supabaseAdmin
    .from("studio_artifacts")
    .update({ meta, title: spec.file_title.slice(0, 120), text: spec.caption })
    .eq("id", id);
  if (error) return errorResponse("Enregistrement impossible", 500, req);

  const uploads = [];
  for (let i = 1; i <= spec.slides.length; i++) {
    const signed = await uploadUrl(carouselPaths.slide(id, version, i));
    if (!signed) return errorResponse("Les envois de slides n'ont pas pu être préparés.", 500, req);
    uploads.push(signed);
  }
  return cors(NextResponse.json({ version, uploads, problems }), req);
}
