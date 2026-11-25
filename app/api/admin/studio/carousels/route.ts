import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { carouselPaths, carouselPhotoRefs, safePhotoName, type CarouselMeta } from "@/lib/studio/carousel";
import {
  MAX_PHOTO_BYTES,
  MIGRATION_MESSAGE,
  PHOTO_TYPES,
  checkSpec,
  isMissingMigration,
  uploadUrl,
} from "@/lib/studio/carousel-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type FileIn = { ref: string; name: string; type: string; size: number };

// "Nouveau > Carrousel": imports a carousel made by the social-carousels skill
// (carrousel.json and its photos folder). Creates the project and the
// carousel, then hands back one signed upload URL per photo so the browser
// sends the files straight to the bucket (no large body through Vercel).
// Nothing is rendered or published here.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const body = (await req.json().catch(() => null)) as { spec?: unknown; files?: unknown } | null;
  if (!body) return errorResponse("Requête invalide", 400, req);

  const { spec, problems, blocking } = checkSpec(body.spec);
  if (!spec || blocking.length) return cors(NextResponse.json({ error: blocking[0]?.message ?? "Carrousel invalide", problems }, { status: 400 }), req);

  const files = (Array.isArray(body.files) ? body.files : [])
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
    .map((f) => ({ ref: String(f.ref ?? ""), name: String(f.name ?? ""), type: String(f.type ?? ""), size: Number(f.size ?? 0) }) as FileIn);
  const byRef = new Map(files.map((f) => [f.ref, f]));

  // Every photo the file names must come with it (URLs excepted).
  const refs = carouselPhotoRefs(spec);
  const missing = refs.filter((ref) => !/^https:\/\//.test(ref) && !byRef.has(ref));
  if (missing.length) return errorResponse(`Photo manquante dans le dossier : ${missing[0]}`, 400, req);
  for (const ref of refs) {
    const f = byRef.get(ref);
    if (!f) continue;
    if (!(PHOTO_TYPES as readonly string[]).includes(f.type)) return errorResponse(`Format non accepté (JPEG, PNG ou WEBP) : ${f.name}`, 400, req);
    if (!(f.size > 0 && f.size <= MAX_PHOTO_BYTES)) return errorResponse(`Photo trop lourde (15 Mo au maximum) : ${f.name}`, 400, req);
  }

  const { data: conversation, error: convError } = await supabaseAdmin
    .from("studio_conversations")
    .insert({ user_id: staff.id, property_id: null, title: spec.file_title.replace(/[—]/g, ",").slice(0, 80) })
    .select("id")
    .single();
  if (convError || !conversation) return errorResponse("Le projet n'a pas pu être créé.", 500, req);

  const { data: artifact, error } = await supabaseAdmin
    .from("studio_artifacts")
    .insert({
      conversation_id: conversation.id,
      kind: "carousel",
      title: spec.file_title.slice(0, 120),
      text: spec.caption,
      pinned: true,
      meta: { spec, slides: [], version: null, rendered_at: null } satisfies CarouselMeta,
    })
    .select("id")
    .single();
  if (error || !artifact) {
    await supabaseAdmin.from("studio_conversations").delete().eq("id", conversation.id);
    if (isMissingMigration(error)) return errorResponse(MIGRATION_MESSAGE, 503, req);
    console.error("Studio carousel: create failed", error?.code);
    return errorResponse("Le carrousel n'a pas pu être créé.", 500, req);
  }

  // Each local photo gets its place in the carousel's folder; the spec points there.
  const pathOf = new Map<string, string>();
  [...byRef.values()]
    .filter((f) => refs.includes(f.ref))
    .forEach((f, i) => pathOf.set(f.ref, carouselPaths.photo(artifact.id, safePhotoName(f.name || f.ref, i + 1))));
  const stored = {
    ...spec,
    slides: spec.slides.map((s) => ({ ...s, photo: pathOf.get(s.photo) ?? s.photo })),
    brand: spec.brand?.badge ? { ...spec.brand, badge: pathOf.get(spec.brand.badge) ?? spec.brand.badge } : spec.brand,
  };
  await supabaseAdmin
    .from("studio_artifacts")
    .update({ meta: { spec: stored, slides: [], version: null, rendered_at: null } satisfies CarouselMeta })
    .eq("id", artifact.id);

  const uploads = [];
  for (const [ref, path] of pathOf) {
    const signed = await uploadUrl(path);
    if (!signed) return errorResponse("Les envois de photos n'ont pas pu être préparés.", 500, req);
    uploads.push({ ref, ...signed, type: byRef.get(ref)?.type ?? "image/jpeg" });
  }

  return cors(
    NextResponse.json({ conversationId: conversation.id, artifactId: artifact.id, uploads, problems }, { status: 201 }),
    req,
  );
}
