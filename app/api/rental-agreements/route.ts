import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { addMonths, format } from "date-fns";
import { creditOwnerEarningsForSchedules } from "@/lib/owner-wallet";
import { unescapeText } from "@/lib/text-sanitize";

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
 *         cautionMois?, loyerAvanceMois?, startDate?, endDate?, termsText?, dosAndDonts?, interdictions? }
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
      loyerAvanceMois,
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
      loyerAvanceMois?: number;
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
        "id, agent_id, address, quartier, price, caution_mois, loyer_avance_mois, interdictions, dos_and_donts, period",
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
    let lockedTransactionMetadata: Record<string, unknown> | null = null;

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
        .select("id, status, type, deposit_id, metadata")
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
      lockedTransactionMetadata =
        (transaction.metadata as Record<string, unknown> | null) || null;
    }

    // Daily rentals allow multiple concurrent agreements (different guests, different date
    // ranges). Conflict detection is handled via property_blocked_dates, not here.
    // For monthly rentals, only one active/draft agreement is permitted at a time.
    if (property.period !== "day") {
      const { data: existing } = await supabaseAdmin
        .from("rental_agreements")
        .select("id, status, renter_id")
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
        // Idempotent renter flow: same renter retrying after a successful payment
        // (e.g. network drop) — return the existing agreement rather than blocking.
        if (isRenterFlow && existing.renter_id === user.id) {
          return cors(
            NextResponse.json({
              success: true,
              agreement: { id: existing.id },
            }),
            req,
          );
        }
        return errorResponse(
          "An active agreement already exists for this property",
          409,
          req,
        );
      }
    } else if (isRenterFlow && lockedTransactionId) {
      const { data: existingDailyAgreement } = await supabaseAdmin
        .from("rental_agreements")
        .select("id")
        .eq("transaction_id", lockedTransactionId)
        .maybeSingle();

      if (existingDailyAgreement) {
        return cors(
          NextResponse.json({
            success: true,
            agreement: { id: existingDailyAgreement.id },
          }),
          req,
        );
      }
    }

    const now = new Date();
    const resolvedCautionMois = Math.min(
      12,
      Math.max(0, Number(cautionMois ?? property.caution_mois ?? 0)),
    );
    const resolvedLoyerAvanceMois =
      property.period === "day"
        ? 1
        : Math.min(
            12,
            Math.max(
              1,
              Number(loyerAvanceMois || property.loyer_avance_mois || 1),
            ),
          );
    const isDailyRenterFlow = isRenterFlow && property.period === "day";

    // Daily renter bookings are fully consented at payment time, so both sides are auto-signed.
    // Monthly flows still start as draft and proceed through the signature workflow.
    const { data: agreement, error: insertError } = await supabaseAdmin
      .from("rental_agreements")
      .insert({
        property_id: propertyId,
        owner_id: ownerId,
        renter_id: renterId,
        application_id: applicationId || null,
        transaction_id: lockedTransactionId,
        status: isDailyRenterFlow ? "active" : "draft",
        monthly_rent: monthlyRent,
        caution_mois: resolvedCautionMois,
        loyer_avance_mois: resolvedLoyerAvanceMois,
        dos_and_donts:
          dosAndDonts.length > 0 ? dosAndDonts : property.dos_and_donts || [],
        interdictions:
          interdictions.length > 0
            ? interdictions
            : property.interdictions || [],
        terms_text: termsText || null,
        start_date: startDate || null,
        end_date: endDate || null,
        property_frequence:
          property.period === "day" ? "journalier" : "mensuel",
        renter_signed_at: isDailyRenterFlow ? now.toISOString() : null,
        owner_signed_at: isDailyRenterFlow ? now.toISOString() : null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error creating rental agreement:", insertError);
      return errorResponse("Failed to create agreement", 500, req);
    }

    // For daily rentals: immediately block the booked dates so no other renter can pick them.
    // This fires at creation (not at activation) because payment was already captured at lock.
    if (isDailyRenterFlow && startDate && endDate) {
      const { error: blockError } = await supabaseAdmin
        .from("property_blocked_dates")
        .insert({
          property_id: propertyId,
          start_date: startDate,
          end_date: endDate,
          block_type: "booked",
          agreement_id: agreement.id,
          created_by: renterId,
        });

      if (blockError) {
        console.error(
          "Error auto-blocking dates for daily agreement:",
          blockError,
        );
        // Non-fatal: agreement is created, dates will be visible as booked after next sync
      }

      // Escrow the caution if one was collected on the property_lock transaction.
      // The payout phone + provider were captured at payment time and stored in metadata.
      const meta = lockedTransactionMetadata || {};
      const cautionAmount = Number(meta.cautionAmount || 0);
      const payoutPhone =
        typeof meta.payoutPhone === "string" ? meta.payoutPhone : null;
      const payoutProvider =
        typeof meta.payoutProvider === "string" ? meta.payoutProvider : null;

      if (cautionAmount > 0 && payoutPhone && payoutProvider) {
        const stayEndAt = new Date(`${endDate}T12:00:00Z`);
        const reviewDeadlineAt = new Date(
          stayEndAt.getTime() + 72 * 60 * 60 * 1000,
        );

        const { error: holdError } = await supabaseAdmin
          .from("deposit_holds")
          .insert({
            agreement_id: agreement.id,
            property_id: propertyId,
            owner_id: ownerId,
            renter_id: renterId,
            amount: cautionAmount,
            currency: "XOF",
            source_transaction_id: lockedTransactionId,
            renter_payout_phone: payoutPhone,
            renter_payout_provider: payoutProvider,
            status: "held",
            stay_end_at: stayEndAt.toISOString(),
            review_deadline_at: reviewDeadlineAt.toISOString(),
          });

        if (holdError) {
          console.error(
            "Error creating deposit hold for daily agreement:",
            holdError,
          );
          // Non-fatal: agreement is created, hold can be backfilled manually if needed.
        }
      }

      const stayAmount = Number(meta.stayAmount || 0);
      const ownerCommissionAmount = Number(meta.ownerCommissionAmount || 0);
      const ownerCommissionBps = Number(meta.ownerCommissionBps || 0);
      const ownerNetAmount = Number(meta.ownerNetAmount || 0);

      if (stayAmount > 0 && ownerNetAmount >= 0) {
        const availableAt = new Date(`${startDate}T00:00:00Z`);
        const { error: earningError } = await supabaseAdmin
          .from("owner_earnings")
          .insert({
            owner_id: ownerId,
            schedule_id: null,
            transaction_id: lockedTransactionId,
            property_id: propertyId,
            agreement_id: agreement.id,
            source_type: "daily_stay",
            gross_rent_amount: stayAmount,
            fee_rate_bps: ownerCommissionBps,
            fee_amount: ownerCommissionAmount,
            net_amount: ownerNetAmount,
            currency: "XOF",
            earned_at: now.toISOString(),
            available_at: availableAt.toISOString(),
          });

        if (earningError) {
          console.error(
            "Error creating daily stay owner earning:",
            earningError,
          );
        }
      }
    }

    // Renter flow: generate 12 monthly rent schedules immediately (only for mensuel — daily rentals have no schedule)
    if (isRenterFlow) {
      if (property.period !== "day") {
        const scheduleStart = startDate ? new Date(startDate) : now;

        const schedules = Array.from({ length: 12 }, (_, i) => {
          const dueDate = addMonths(scheduleStart, i);
          const isCoveredByMoveInPayment = i < resolvedLoyerAvanceMois;
          return {
            agreement_id: agreement.id,
            property_id: propertyId,
            renter_id: renterId,
            owner_id: ownerId,
            due_date: format(dueDate, "yyyy-MM-dd"),
            amount: monthlyRent,
            status: isCoveredByMoveInPayment ? "paid" : "upcoming",
            transaction_id: isCoveredByMoveInPayment
              ? lockedTransactionId
              : null,
            paid_at: isCoveredByMoveInPayment ? now.toISOString() : null,
          };
        });

        const { data: insertedSchedules, error: scheduleError } =
          await supabaseAdmin
            .from("rent_schedules")
            .insert(schedules)
            .select("id, status");

        if (scheduleError) {
          console.error("Error creating rent schedules:", scheduleError);
        } else {
          const paidScheduleIds = (insertedSchedules || [])
            .filter((schedule) => schedule.status === "paid")
            .map((schedule) => schedule.id);
          await creditOwnerEarningsForSchedules(paidScheduleIds);
        }
      }

      // Notify owner; daily stays are already auto-signed, monthly stays still need prep.
      try {
        await notifyUserWithTemplate(
          ownerId,
          "payments",
          isDailyRenterFlow
            ? "agreements.ownerStayConfirmed"
            : "agreements.ownerPropertySecured",
          {
            location:
              unescapeText(property.quartier || property.address) ||
              "votre bien",
          },
          {
            agreementId: agreement.id,
            propertyId,
            action: isDailyRenterFlow ? "view_agreement" : "review_agreement",
          },
        );
      } catch (e) {
        console.warn("Failed to send push notification to owner:", e);
      }
    } else {
      // Owner flow: notify renter that a draft agreement was created
      try {
        await notifyUserWithTemplate(
          renterId,
          "payments",
          "agreements.renterDraftCreated",
          {
            location:
              unescapeText(property.quartier || property.address) ||
              "votre bien",
          },
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
