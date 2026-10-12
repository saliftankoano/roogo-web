import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { loadPropertyRow, propertyLabels } from "@/lib/studio/conversations-server";
import { buildCaption } from "@/lib/studio/publishing";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// "Générer la légende": the house caption template filled from the listing.
// Deterministic (no model), so the price and the phone number are always right.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const body = (await req.json().catch(() => null)) as { propertyId?: unknown } | null;
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId : "";
  if (!propertyId) return errorResponse("Choisissez d'abord un bien.", 400, req);
  const property = await loadPropertyRow(propertyId);
  if (!property) return errorResponse("Bien introuvable", 404, req);
  return cors(NextResponse.json({ caption: buildCaption(property, propertyLabels) }), req);
}
