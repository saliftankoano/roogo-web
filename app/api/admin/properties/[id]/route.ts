import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type PropertyDetailsRow = Record<string, unknown>;

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asNumber = (value: unknown) =>
  typeof value === "number" ? value : Number(value ?? 0) || 0;
const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

function mapAdminProperty(row: PropertyDetailsRow) {
  const quartier = asString(row.quartier);
  const city = asString(row.city);
  const images = asStringArray(row.images);
  const primaryImage = asString(row.primary_image);

  return {
    id: asString(row.id),
    location: [quartier, city].filter(Boolean).join(", ") || asString(row.address),
    address: asString(row.address),
    price: asNumber(row.price),
    bedrooms: asNumber(row.bedrooms),
    bathrooms: asNumber(row.bathrooms),
    area: asNumber(row.area),
    parking: asNumber(row.parking_spaces),
    period: asString(row.period),
    image: primaryImage || images[0] || "",
    images,
    isSponsored: Boolean(row.is_boosted),
    status: asString(row.status),
    propertyType: asString(row.property_type),
    description: asString(row.description),
    amenities: asStringArray(row.amenities),
    views: asNumber(row.views_count),
    favorites: asNumber(row.favorites_count),
    city,
    quartier,
    created_at: asString(row.created_at),
    deposit: asNumber(row.caution_mois ?? row.deposit),
    loyerAvanceMois: asNumber(row.loyer_avance_mois) || 1,
    payment_id: asString(row.payment_id) || null,
    transaction_id: asString(row.transaction_id) || null,
    is_test: Boolean(row.is_test),
    virtualTourUrl: asString(row.virtual_tour_url),
    agent: {
      full_name: asString(row.agent_name) || "Utilisateur inconnu",
      phone: asString(row.agent_phone),
      email: asString(row.agent_email),
      avatar_url: asString(row.agent_avatar),
      user_type: asString(row.agent_type),
      company_name: asString(row.agent_company_name),
      facebook_url: asString(row.agent_facebook_url),
      identity_verification_status: asString(
        row.agent_identity_verification_status,
      ),
      identity_verified: Boolean(row.agent_identity_verified),
    },
  };
}

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getStaffOrFounder(req);
    if (!user) return errorResponse("Forbidden", 403, req);

    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("property_details")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching admin property:", error);
      return errorResponse("Failed to fetch property", 500, req);
    }

    if (!data) return errorResponse("Property not found", 404, req);

    return cors(NextResponse.json({ property: mapAdminProperty(data) }), req);
  } catch (error) {
    console.error("Error in GET /api/admin/properties/[id]:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
