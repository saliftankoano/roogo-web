import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { canWriteConversation, loadConversation } from "@/lib/studio/conversations-server";
import { carouselPaths, safePhotoName } from "@/lib/studio/carousel";
import { MAX_PHOTO_BYTES, PHOTO_TYPES, carouselPhotoLibrary, loadCarousel, uploadUrl } from "@/lib/studio/carousel-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type Ctx = { params: Promise<{ id: string }> };

// "Importer une photo" in the carousel editor: a new photo joins the
// carousel's folder (it then shows in every slide's photo picker). Returns a
// signed upload URL; the browser sends the file straight to the bucket.
export async function POST(req: Request, { params }: Ctx) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const found = await loadCarousel(id);
  const conv = found ? await loadConversation(found.row.conversation_id) : null;
  if (!found || !conv || !canWriteConversation(staff, conv)) return errorResponse("Carrousel introuvable", 404, req);

  const body = (await req.json().catch(() => null)) as { name?: unknown; type?: unknown; size?: unknown } | null;
  const name = String(body?.name ?? "photo.jpg");
  const type = String(body?.type ?? "");
  const size = Number(body?.size ?? 0);
  if (!(PHOTO_TYPES as readonly string[]).includes(type)) return errorResponse("Format non accepté (JPEG, PNG ou WEBP).", 400, req);
  if (!(size > 0 && size <= MAX_PHOTO_BYTES)) return errorResponse("Photo trop lourde (15 Mo au maximum).", 400, req);

  const count = (await carouselPhotoLibrary(id)).length;
  const signed = await uploadUrl(carouselPaths.photo(id, safePhotoName(name, count + 1).replace(/^(\d+)-/, `$1-${Date.now().toString(36)}-`)));
  if (!signed) return errorResponse("L'envoi n'a pas pu être préparé.", 500, req);
  return cors(NextResponse.json({ ...signed, type }), req);
}
