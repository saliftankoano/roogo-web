import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyUserWithTemplate } from "@/lib/push-notifications";

const BUCKET = "rental-agreement-imports";
const ERROR_STATUS: Record<string, number> = {
  forbidden: 403,
  property_not_found: 404,
  renter_not_found: 404,
  active_agreement_exists: 409,
  invalid_renter_type: 400,
  not_monthly_rental: 400,
  document_required: 400,
  invalid_lease_dates: 400,
  invalid_offline_amounts: 400,
  owner_missing: 400,
  property_not_available: 409,
};

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const url = new URL(req.url);
  const ownerId = url.searchParams.get("owner_id");
  const propertyId = url.searchParams.get("property_id");

  let query = supabaseAdmin
    .from("properties")
    .select("id, agent_id, address, quartier, city, price, caution_mois, status, listing_type, period, frequence, created_at")
    .eq("listing_type", "louer")
    .or("period.is.null,period.neq.day")
    .or("frequence.is.null,frequence.neq.journalier")
    .eq("status", "en_ligne")
    .order("created_at", { ascending: false })
    .limit(100);
  if (ownerId) query = query.eq("agent_id", ownerId);
  if (propertyId) query = query.eq("id", propertyId);
  const { data, error } = await query;
  if (error) return errorResponse("Failed to load eligible properties", 500, req);

  const ids = (data ?? []).map((row) => row.id);
  const { data: conflicts } = ids.length
    ? await supabaseAdmin
        .from("rental_agreements")
        .select("property_id")
        .in("property_id", ids)
        .in("status", ["draft", "sent", "renter_signed", "owner_signed", "active"])
    : { data: [] };
  const unavailable = new Set((conflicts ?? []).map((row) => row.property_id));
  const ownerIds = [...new Set((data ?? []).map((row) => row.agent_id).filter(Boolean))];
  const { data: owners } = ownerIds.length
    ? await supabaseAdmin.from("users").select("id, full_name").in("id", ownerIds)
    : { data: [] };
  const ownerNames = new Map((owners ?? []).map((owner) => [owner.id, owner.full_name]));
  return cors(NextResponse.json({ properties: (data ?? []).filter((row) => !unavailable.has(row.id)).map((row) => ({ ...row, agent_name: ownerNames.get(row.agent_id) ?? null })) }), req);
}

export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !body.property_id || !body.renter_id) {
    return errorResponse("Invalid import request", 400, req);
  }
  const paths = Array.isArray(body?.signed_document_paths)
    ? body.signed_document_paths.filter((path: unknown): path is string => typeof path === "string")
    : [];
  const prefix = `${staff.id}/${body?.property_id}/`;
  if (!paths.length || paths.some((path: string) => !path.startsWith(prefix))) {
    return cors(NextResponse.json({ error: "Signed lease is required", code: "document_required" }, { status: 400 }), req);
  }

  for (const path of paths as string[]) {
    const lastSlash = path.lastIndexOf("/");
    const folder = path.slice(0, lastSlash);
    const name = path.slice(lastSlash + 1);
    const { data } = await supabaseAdmin.storage.from(BUCKET).list(folder, { search: name, limit: 1 });
    if (!data?.some((item) => item.name === name)) {
      return cors(NextResponse.json({ error: "Signed lease is required", code: "document_required" }, { status: 400 }), req);
    }
  }

  const args = {
    p_property_id: body.property_id,
    p_renter_id: body.renter_id,
    p_imported_by: staff.id,
    p_monthly_rent: Number(body.monthly_rent),
    p_caution_mois: Number(body.caution_mois ?? 0),
    p_start_date: body.start_date,
    p_end_date: body.end_date || null,
    p_external_signed_at: body.external_signed_at,
    p_signed_document_paths: paths,
    p_rent_months_paid: Number(body.rent_months_paid ?? 0),
    p_caution_amount: Number(body.caution_amount ?? 0),
    p_payment_date: body.payment_date || null,
    p_payment_method: body.payment_method || null,
    p_payment_reference: body.payment_reference || null,
    p_commission_amount: Number(body.commission_amount ?? 0),
    p_commission_date: body.commission_date || null,
    p_commission_method: body.commission_method || null,
    p_commission_reference: body.commission_reference || null,
    p_notes: body.notes || null,
  };
  const { data, error } = await supabaseAdmin.rpc("import_existing_monthly_lease", args);
  if (error) {
    const code = Object.keys(ERROR_STATUS).find((value) => error.message.includes(value)) ?? "import_failed";
    return cors(NextResponse.json({ error: error.message, code }, { status: ERROR_STATUS[code] ?? 500 }), req);
  }

  const result = Array.isArray(data) ? data[0] : data;
  const { data: agreement } = await supabaseAdmin
    .from("rental_agreements")
    .select("owner_id, renter_id, properties(address, quartier, city)")
    .eq("id", result.agreement_id)
    .single();
  const property = Array.isArray(agreement?.properties) ? agreement.properties[0] : agreement?.properties;
  const propertyName = property?.address || [property?.quartier, property?.city].filter(Boolean).join(", ") || "votre logement";
  if (agreement) {
    await Promise.allSettled([
      notifyUserWithTemplate(agreement.owner_id, "payments", "agreements.activeOwner", { location: propertyName }, { type: "agreement_active", agreementId: result.agreement_id }),
      notifyUserWithTemplate(agreement.renter_id, "payments", "agreements.activeRenter", { location: propertyName }, { type: "agreement_active", agreementId: result.agreement_id }),
    ]);
  }
  return cors(NextResponse.json({ success: true, ...result }, { status: 201 }), req);
}
