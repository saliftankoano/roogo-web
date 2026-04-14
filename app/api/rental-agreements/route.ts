import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";
import { notifyUser } from "@/lib/push-notifications";
import { addMonths, format } from "date-fns";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * POST /api/rental-agreements
 * Supports two flows:
 *
 *   1. Owner flow: owner creates a draft agreement.
 *      Caller must be the property owner. renterId required in body.
 *      Agreement stays as "draft" for manual signing.
 *
 *   2. Renter flow (property_lock): renter calls after a completed property_lock payment.
 *      Caller must have a completed property_lock transaction for this property.
 *      owner_id is resolved from the property; renter_id is the caller.
 *      Agreement is immediately activated, 12 rent schedules are generated,
 *      and the first schedule is marked paid (covered by the property_lock payment).
 *
 * Body: { transactionId?, applicationId?, propertyId, renterId?, monthlyRent,
 *         cautionMois?, startDate?, endDate?, termsText?, dosAndDonts?, interdictions? }
 */
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const body = await req.json();
    const {
      applicationId,
      propertyId,
      renterId: bodyRenterId,
      monthlyRent,
      cautionMois = 1,
      startDate,
      endDate,
      termsText,
      dosAndDonts = [],
      interdictions = [],
    } = body as {
      applicationId?: string;
      propertyId: string;
      renterId?: string;
      monthlyRent: number;
      cautionMois?: number;
      startDate?: string;
      endDate?: string;
      termsText?: string;
      dosAndDonts?: string[];
      interdictions?: string[];
    };

    if (!propertyId || !monthlyRent) {
      return errorResponse("propertyId and monthlyRent are required", 400, req);
    }

    // Fetch the property (no is_test filter — supports test properties in dev)
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select(
        "id, agent_id, address, quartier, price, caution_mois, interdictions, dos_and_donts",
      )
      .eq("id", propertyId)
      .single();

    if (!property) {
      return errorResponse("Property not found", 404, req);
    }

    let ownerId: string;
    let renterId: string;
    let isRenterFlow = false;
    let lockedTransactionId: string | null = null;

    if (property.agent_id === user.id) {
      // --- Owner flow ---
      if (!bodyRenterId) {
        return errorResponse(
          "renterId is required when creating an agreement as owner",
          400,
          req,
        );
      }
      ownerId = user.id;
      renterId = bodyRenterId;
    } else {
      // --- Renter flow ---
      // Verify the caller has a completed property_lock transaction for this property.
      const { data: transaction } = await supabaseAdmin
        .from("transactions")
        .select("id, status, type, deposit_id")
        .eq("property_id", propertyId)
        .eq("user_id", user.id)
        .eq("type", "property_lock")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!transaction) {
        return errorResponse(
          "No completed property_lock payment found for this property. Complete payment before creating an agreement.",
          403,
          req,
        );
      }

      ownerId = property.agent_id;
      renterId = bodyRenterId || user.id;
      isRenterFlow = true;
      // Use the Supabase transactions.id (FK target), not the PawaPay deposit ID
      lockedTransactionId = transaction.id;
    }

    // Check no active/draft agreement already exists
    const { data: existing } = await supabaseAdmin
      .from("rental_agreements")
      .select("id, status")
      .eq("property_id", propertyId)
      .in("status", [
        "draft",
        "sent",
        "renter_signed",
        "owner_signed",
        "active",
      ])
      .maybeSingle();

    if (existing) {
      return errorResponse(
        "An active agreement already exists for this property",
        409,
        req,
      );
    }

    const now = new Date();
    const resolvedCautionMois = cautionMois || property.caution_mois || 1;

    // Agreement always starts as draft — schedules are created immediately (separate concern)
    const { data: agreement, error: insertError } = await supabaseAdmin
      .from("rental_agreements")
      .insert({
        property_id: propertyId,
        owner_id: ownerId,
        renter_id: renterId,
        application_id: applicationId || null,
        status: "draft",
        monthly_rent: monthlyRent,
        caution_mois: resolvedCautionMois,
        dos_and_donts:
          dosAndDonts.length > 0 ? dosAndDonts : property.dos_and_donts || [],
        interdictions:
          interdictions.length > 0
            ? interdictions
            : property.interdictions || [],
        terms_text: termsText || null,
        start_date: startDate || null,
        end_date: endDate || null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error creating rental agreement:", insertError);
      return errorResponse("Failed to create agreement", 500, req);
    }

    // Renter flow: generate 12 monthly rent schedules immediately (independent of agreement signing)
    if (isRenterFlow) {
      const scheduleStart = startDate ? new Date(startDate) : now;

      const schedules = Array.from({ length: 12 }, (_, i) => {
        const dueDate = addMonths(scheduleStart, i);
        const isFirst = i === 0;
        return {
          agreement_id: agreement.id,
          property_id: propertyId,
          renter_id: renterId,
          owner_id: ownerId,
          due_date: format(dueDate, "yyyy-MM-dd"),
          amount: monthlyRent,
          status: isFirst ? "paid" : "upcoming",
          transaction_id: isFirst ? lockedTransactionId : null,
          paid_at: isFirst ? now.toISOString() : null,
        };
      });

      const { error: scheduleError } = await supabaseAdmin
        .from("rent_schedules")
        .insert(schedules);

      if (scheduleError) {
        console.error("Error creating rent schedules:", scheduleError);
      }

      // Notify owner to prepare the lease
      try {
        await notifyUser(
          ownerId,
          "payments",
          "Propriété sécurisée !",
          `Un locataire a sécurisé votre bien au ${property.quartier || property.address}. Préparez le contrat de bail.`,
          { agreementId: agreement.id, propertyId, action: "review_agreement" },
        );
      } catch (e) {
        console.warn("Failed to send push notification to owner:", e);
      }
    } else {
      // Owner flow: notify renter that a draft agreement was created
      try {
        await notifyUser(
          renterId,
          "payments",
          "Nouveau contrat de bail",
          `Un contrat de bail a été créé pour votre bien au ${property.quartier || property.address}. Veuillez le consulter et signer.`,
          { agreementId: agreement.id, propertyId },
        );
      } catch (e) {
        console.warn("Failed to send push notification to renter:", e);
      }
    }

    return cors(
      NextResponse.json({ success: true, agreement: { id: agreement.id } }),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/rental-agreements:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
