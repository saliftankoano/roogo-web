import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AssistedProperty = {
  id: string;
  agent_id: string | null;
  listing_type: string;
  ownership_verification_status: string;
};

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function listAssistedSubmissionCandidates(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = normalizeSearchValue(searchParams.get("q") || "");

  const { data, error } = await supabaseAdmin
    .from("properties")
    .select(
      `
      id,
      agent_id,
      property_type,
      price,
      quartier,
      city,
      status,
      listing_type,
      ownership_verification_status,
      created_at,
      seller:agent_id (
        id,
        full_name,
        email,
        phone,
        user_type
      )
    `,
    )
    .eq("listing_type", "vendre")
    .not("agent_id", "is", null)
    .in("ownership_verification_status", ["unsubmitted", "rejected"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Admin ownership candidate list failed:", error);
    return NextResponse.json(
      { error: "Impossible de charger les ventes sans dossier." },
      { status: 500 },
    );
  }

  const properties = search
    ? (data ?? []).filter((property) => {
        const seller = Array.isArray(property.seller)
          ? property.seller[0]
          : property.seller;
        return normalizeSearchValue(
          [
            property.quartier,
            property.city,
            property.property_type,
            seller?.full_name,
            seller?.email,
            seller?.phone,
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(search);
      })
    : (data ?? []);

  return NextResponse.json({ success: true, properties });
}

// Queue of property ownership submissions for the admin review panel.
// Cloned from the identity-verifications list route. requireStaffSupabaseUser
// covers staff + founder.
export async function GET(req: Request) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const { searchParams } = new URL(req.url);
    if (searchParams.get("mode") === "candidates") {
      return listAssistedSubmissionCandidates(req);
    }
    const status = searchParams.get("status") || "pending";

    let query = supabaseAdmin
      .from("property_ownership_submissions")
      .select(
        `
        id,
        property_id,
        user_id,
        status,
        submitted_at,
        reviewed_at,
        reviewed_by,
        rejection_reason,
        review_notes,
        users:user_id (
          id,
          full_name,
          email,
          phone,
          avatar_url,
          user_type
        ),
        property:property_id (
          id,
          property_type,
          price,
          quartier,
          city,
          ownership_verification_status,
          status
        ),
        reviewer:reviewed_by (
          id,
          full_name,
          email
        )
      `,
      )
      .order("submitted_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Admin ownership verification list failed:", error);
      return NextResponse.json(
        { error: "Failed to load submissions" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, submissions: data ?? [] });
  } catch (error) {
    console.error("GET /api/admin/ownership-verifications:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Staff/founders can bootstrap the same private review object a seller would
// normally create from mobile. Documents are still uploaded through the
// staff-only private-bucket routes, which record source=staff + uploaded_by.
export async function POST(req: Request) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const body = (await req.json().catch(() => null)) as {
      property_id?: unknown;
    } | null;
    const propertyId =
      typeof body?.property_id === "string" ? body.property_id.trim() : "";

    if (!propertyId) {
      return NextResponse.json(
        { error: "Sélectionnez une annonce à vendre." },
        { status: 400 },
      );
    }

    const { data: property, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select("id, agent_id, listing_type, ownership_verification_status")
      .eq("id", propertyId)
      .maybeSingle<AssistedProperty>();

    if (propertyError) throw propertyError;
    if (!property) {
      return NextResponse.json({ error: "Annonce introuvable." }, { status: 404 });
    }
    if (property.listing_type !== "vendre") {
      return NextResponse.json(
        { error: "Seules les annonces à vendre utilisent ce dossier." },
        { status: 400 },
      );
    }
    if (!property.agent_id) {
      return NextResponse.json(
        { error: "Rattachez d'abord cette vente à son propriétaire." },
        { status: 409 },
      );
    }
    if (property.ownership_verification_status === "approved") {
      return NextResponse.json(
        { error: "Les documents de cette annonce sont déjà approuvés." },
        { status: 409 },
      );
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("property_ownership_submissions")
      .select("id, status")
      .eq("property_id", property.id)
      .eq("status", "pending")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      const { error: statusError } = await supabaseAdmin
        .from("properties")
        .update({
          ownership_verification_status: "pending",
          ownership_verified_at: null,
          ownership_verified_by: null,
          ownership_verification_rejection_reason: null,
        })
        .eq("id", property.id);

      if (statusError) throw statusError;
      return NextResponse.json({
        success: true,
        submission: existing,
        reused: true,
      });
    }

    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("property_ownership_submissions")
      .insert({
        property_id: property.id,
        user_id: property.agent_id,
        documents: [],
        status: "pending",
      })
      .select("id, status, submitted_at")
      .single();

    if (submissionError || !submission) {
      throw submissionError ?? new Error("Unable to create ownership submission");
    }

    const { error: statusError } = await supabaseAdmin
      .from("properties")
      .update({
        ownership_verification_status: "pending",
        ownership_verified_at: null,
        ownership_verified_by: null,
        ownership_verification_rejection_reason: null,
      })
      .eq("id", property.id);

    if (statusError) {
      console.error("Assisted ownership property status update failed:", statusError);
      return NextResponse.json(
        {
          error:
            "Le dossier a été créé, mais le statut de l'annonce n'a pas pu être mis à jour.",
          submission,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, submission, reused: false });
  } catch (error) {
    console.error("POST /api/admin/ownership-verifications:", error);
    return NextResponse.json(
      { error: "Impossible de créer le dossier de vérification." },
      { status: 500 },
    );
  }
}
