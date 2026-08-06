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
const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

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
    translationSourceLocale: asString(row.translation_source_locale),
    translationStatus: asString(row.translation_status),
    translations: asRecord(row.translations),
    translatedAt: asString(row.translated_at),
    translationError: asString(row.translation_error),
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
    listingType: asString(row.listing_type),
    agentId: asString(row.agent_id) || null,
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

    const { data: intake, error: intakeError } = await supabaseAdmin
      .from("sale_intakes")
      .select(
        "id, owner_first_name, owner_last_name, owner_phone, phone_has_whatsapp, status, linked_user_id, linked_at, created_at, created_by_user:created_by(full_name, email)",
      )
      .eq("property_id", id)
      .maybeSingle();
    if (intakeError) {
      console.error("Error fetching direct sale intake:", intakeError);
      return errorResponse("Failed to fetch sale intake", 500, req);
    }

    return cors(
      NextResponse.json({
        property: {
          ...mapAdminProperty(data),
          saleIntake: intake ?? null,
        },
      }),
      req,
    );
  } catch (error) {
    console.error("Error in GET /api/admin/properties/[id]:", error);
    return errorResponse("Internal server error", 500, req);
  }
}

const LINK_ERROR_STATUS: Record<string, number> = {
  already_linked: 409,
  invalid_owner_type: 400,
  owner_not_found: 404,
  not_direct_sale: 404,
};
const LINK_ERROR_MESSAGE: Record<string, string> = {
  already_linked: "Cette annonce est déjà rattachée à un compte.",
  invalid_owner_type: "Le compte sélectionné doit être propriétaire ou agent.",
  owner_not_found: "Le compte sélectionné est introuvable.",
  not_direct_sale: "Cette annonce n'est pas une vente en entrée directe.",
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getStaffOrFounder(req);
    if (!user) return errorResponse("Forbidden", 403, req);

    const { id } = await params;
    const body = (await req.json()) as { user_id?: unknown };
    const targetUserId =
      typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!targetUserId) {
      return cors(
        NextResponse.json(
          { error: "user_id is required", code: "owner_not_found" },
          { status: 400 },
        ),
        req,
      );
    }

    const { data, error } = await supabaseAdmin.rpc("link_sale_intake_owner", {
      p_property_id: id,
      p_target_user_id: targetUserId,
      p_actor_user_id: user.id,
    });
    if (error) {
      console.error("Direct sale owner link failed:", error);
      return errorResponse("Failed to link owner", 500, req);
    }

    const result = data as {
      ok?: boolean;
      code?: string;
      owner_id?: string;
      conversation_id?: string;
    } | null;
    if (!result?.ok) {
      const code = result?.code || "not_direct_sale";
      return cors(
        NextResponse.json(
          { error: LINK_ERROR_MESSAGE[code] ?? "Rattachement impossible.", code },
          { status: LINK_ERROR_STATUS[code] ?? 400 },
        ),
        req,
      );
    }

    return cors(NextResponse.json({ success: true, ...result }), req);
  } catch (error) {
    console.error("PATCH /api/admin/properties/[id]:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
