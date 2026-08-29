import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type PropertyDetailsRow = Record<string, unknown>;

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapAdminProperty(row: PropertyDetailsRow) {
  const quartier = asString(row.quartier);
  const city = asString(row.city);
  const images = asStringArray(row.images);
  const primaryImage = asString(row.primary_image);
  const propertyType = asString(row.property_type);

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
    propertyType,
    category:
      propertyType.toLowerCase() === "commercial"
        ? "Business"
        : "Residential",
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

async function countByStatus(status: string) {
  const { count } = await supabaseAdmin
    .from("property_details")
    .select("id", { count: "exact", head: true })
    .eq("status", status)
    .eq("is_test", false);

  return count ?? 0;
}

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  try {
    const user = await getStaffOrFounder(req);
    if (!user) return errorResponse("Forbidden", 403, req);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "en_attente";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);

    let query = supabaseAdmin
      .from("property_details")
      .select("*")
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const [{ data, error }, enAttente, enLigne, expired] = await Promise.all([
      query,
      countByStatus("en_attente"),
      countByStatus("en_ligne"),
      countByStatus("expired"),
    ]);

    if (error) {
      console.error("Error fetching admin properties:", error);
      return errorResponse("Failed to fetch properties", 500, req);
    }

    const rows = (data as PropertyDetailsRow[] | null) ?? [];
    const propertyIds = rows.map((row) => asString(row.id)).filter(Boolean);
    const { data: intakes, error: intakesError } = propertyIds.length
      ? await supabaseAdmin
          .from("sale_intakes")
          .select(
            "property_id, owner_first_name, owner_last_name, owner_phone, phone_has_whatsapp, status",
          )
          .in("property_id", propertyIds)
      : { data: [], error: null };
    if (intakesError) {
      console.error("Error fetching direct sale intakes:", intakesError);
      return errorResponse("Failed to fetch sale intakes", 500, req);
    }
    const intakeByProperty = new Map(
      (intakes ?? []).map((intake) => [intake.property_id, intake]),
    );

    return cors(
      NextResponse.json({
        properties: rows.map((row) => ({
          ...mapAdminProperty(row),
          saleIntake: intakeByProperty.get(asString(row.id)) ?? null,
        })),
        counts: {
          en_attente: enAttente,
          en_ligne: enLigne,
          expired,
        },
      }),
      req,
    );
  } catch (error) {
    console.error("Error in GET /api/admin/properties:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
