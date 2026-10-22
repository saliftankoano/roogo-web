import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadPropertyRow, propertyLabels } from "@/lib/studio/conversations-server";
import { TOUR_LINK_CAPTION, buildCaption, isIsoDate, planVisitCadence } from "@/lib/studio/publishing";
import { PUBLICATION_COLUMNS, publishSlots, toDtos, type PublicationRow } from "@/lib/studio/publishing-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// "Planifier une visite": the five cadence posts of a field visit, on
// business days after the visit, all "à faire" until a founder validates them.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId : "";
  const visitDate = body?.visitDate;
  if (!propertyId) return errorResponse("Choisissez un bien.", 400, req);
  if (!isIsoDate(visitDate)) return errorResponse("Choisissez la date de la visite.", 400, req);

  let assigneeId = staff.id;
  if (typeof body?.assigneeId === "string" && body.assigneeId) {
    const { data } = await supabaseAdmin.from("users").select("id, user_type").eq("id", body.assigneeId).maybeSingle();
    if (!data || !["staff", "founder"].includes(data.user_type ?? "")) return errorResponse("Cette personne ne fait pas partie de l'équipe.", 400, req);
    assigneeId = data.id;
  }

  const property = await loadPropertyRow(propertyId);
  if (!property) return errorResponse("Bien introuvable", 404, req);

  const { data: existing } = await supabaseAdmin
    .from("studio_publications")
    .select("id")
    .eq("property_id", propertyId)
    .eq("visit_date", visitDate)
    .not("cadence_step", "is", null)
    .limit(1);
  if (existing?.length) return errorResponse("Cette visite est déjà planifiée.", 409, req);

  const caption = buildCaption(property, propertyLabels);
  const photos = (property.images ?? []).slice(0, 10);
  const rows = planVisitCadence(visitDate, publishSlots()).map((p) => ({
    property_id: propertyId,
    title: p.title,
    cadence_step: p.step,
    visit_date: visitDate,
    media_type: p.mediaType,
    photo_urls: p.step === "carousel" ? photos : [],
    caption: p.step === "tour_3d_link" ? TOUR_LINK_CAPTION : caption,
    notes: p.notes,
    networks: p.networks,
    scheduled_at: p.scheduledAt,
    assignee_id: assigneeId,
    status: "a_faire",
    created_by: staff.id,
  }));

  const { data, error } = await supabaseAdmin.from("studio_publications").insert(rows).select(PUBLICATION_COLUMNS);
  if (error) {
    console.error("Studio calendar: visit plan failed", error.code);
    return errorResponse("Planification impossible", 500, req);
  }
  const posts = await toDtos((data ?? []) as PublicationRow[]);
  return cors(NextResponse.json({ posts }), req);
}
