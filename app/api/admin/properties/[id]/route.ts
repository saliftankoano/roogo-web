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
    reference: asString(row.reference) || null,
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
    ownershipVerificationStatus: asString(row.ownership_verification_status) || null,
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

const ACTIVE_AGREEMENT_STATUSES = ["active", "owner_signed", "renter_signed", "sent"];

// Current lease on this property (signed in-app or imported), with the
// renter's contact card and a rent-schedule summary, so staff can see who
// lives there without leaving the listing page.
async function loadActiveLease(propertyId: string) {
  const { data: agreement, error } = await supabaseAdmin
    .from("rental_agreements")
    .select(
      "id, status, renter_id, owner_id, monthly_rent, caution_mois, loyer_avance_mois, start_date, end_date, owner_signed_at, renter_signed_at, signature_source, imported_at, created_at",
    )
    .eq("property_id", propertyId)
    .in("status", ACTIVE_AGREEMENT_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Error fetching active lease:", error);
    return null;
  }
  if (!agreement) return null;

  const [{ data: renter }, { data: schedules }] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("id, full_name, phone, whatsapp, email, avatar_url, user_type")
      .eq("id", agreement.renter_id)
      .maybeSingle(),
    supabaseAdmin
      .from("rent_schedules")
      .select("due_date, status, amount, paid_at, payment_source")
      .eq("agreement_id", agreement.id)
      .order("due_date", { ascending: true }),
  ]);

  const rows = schedules ?? [];
  const paid = rows.filter((row) => row.status === "paid");
  const next = rows.find((row) => row.status === "upcoming" || row.status === "overdue") ?? null;

  return {
    id: agreement.id,
    status: agreement.status,
    monthlyRent: asNumber(agreement.monthly_rent),
    cautionMois: asNumber(agreement.caution_mois),
    startDate: asString(agreement.start_date) || null,
    endDate: asString(agreement.end_date) || null,
    signedAt: asString(agreement.owner_signed_at) || asString(agreement.renter_signed_at) || null,
    signatureSource: asString(agreement.signature_source) || "in_app",
    importedAt: asString(agreement.imported_at) || null,
    renter: renter
      ? {
          id: asString(renter.id),
          full_name: asString(renter.full_name) || "Locataire",
          phone: asString(renter.phone) || null,
          whatsapp: asString(renter.whatsapp) || null,
          email: asString(renter.email) || null,
          avatar_url: asString(renter.avatar_url) || null,
          user_type: asString(renter.user_type) || "renter",
        }
      : null,
    rent: {
      total: rows.length,
      paid: paid.length,
      paidOffline: paid.filter((row) => row.payment_source === "offline_import").length,
      overdue: rows.filter((row) => row.status === "overdue").length,
      nextDueDate: next ? asString(next.due_date) : null,
      nextStatus: next ? asString(next.status) : null,
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

    const activeLease = await loadActiveLease(id);

    // « Vendu » (migration 093): the views do not carry the sold columns, so
    // read them from the table. Before 093 runs they are missing: no sale.
    const { data: sold, error: soldError } = await supabaseAdmin
      .from("properties")
      .select("sold_at, sold_price")
      .eq("id", id)
      .maybeSingle();
    if (soldError && soldError.code !== "42703") {
      console.error("Error fetching sold fields:", { code: soldError.code, message: soldError.message });
    }
    const soldRow = soldError ? null : (sold as { sold_at: string | null; sold_price: number | null } | null);

    // Sale checks for the publish popup and the « publiée sans vérifications »
    // record (migration 108; before it runs the record is simply absent).
    const isSale = data.listing_type === "vendre";
    const [{ data: skipped, error: skippedError }, { data: mandates }] = isSale
      ? await Promise.all([
          supabaseAdmin
            .from("properties")
            .select("sale_checks_skipped, sale_checks_skipped_at, skipped_by:sale_checks_skipped_by(full_name)")
            .eq("id", id)
            .maybeSingle(),
          supabaseAdmin
            .from("property_mandates")
            .select("id")
            .eq("property_id", id)
            .eq("status", "signed")
            .limit(1),
        ])
      : [{ data: null, error: null }, { data: null }];
    if (skippedError && skippedError.code !== "42703") {
      console.error("Error fetching skipped sale checks:", skippedError.code);
    }
    const skippedRow = skippedError
      ? null
      : (skipped as {
          sale_checks_skipped: string[] | null;
          sale_checks_skipped_at: string | null;
          skipped_by: { full_name: string | null } | { full_name: string | null }[] | null;
        } | null);
    const skippedBy = Array.isArray(skippedRow?.skipped_by)
      ? skippedRow?.skipped_by[0]
      : skippedRow?.skipped_by;

    return cors(
      NextResponse.json({
        property: {
          ...mapAdminProperty(data),
          hasSignedMandate: isSale ? Boolean(mandates?.length) : null,
          saleChecksSkipped: skippedRow?.sale_checks_skipped?.length
            ? {
                checks: skippedRow.sale_checks_skipped,
                at: skippedRow.sale_checks_skipped_at,
                by: skippedBy?.full_name ?? null,
              }
            : null,
          soldAt: soldRow?.sold_at ?? null,
          soldPrice: soldRow?.sold_price == null ? null : Number(soldRow.sold_price),
          saleIntake: intake ?? null,
          activeLease,
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
