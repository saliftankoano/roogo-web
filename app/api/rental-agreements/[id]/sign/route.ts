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
 * POST /api/rental-agreements/:id/sign
 * Body: { role: "owner" | "renter" }
 * - Records signature timestamp
 * - When both parties signed: status → 'active', generate 12 rent_schedule rows
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agreementId } = await params;

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const body = await req.json();
    const { role } = body as { role: "owner" | "renter" };

    if (!role || !["owner", "renter"].includes(role)) {
      return errorResponse("role must be 'owner' or 'renter'", 400, req);
    }

    const { data: agreement, error: fetchError } = await supabaseAdmin
      .from("rental_agreements")
      .select("*")
      .eq("id", agreementId)
      .single();

    if (fetchError || !agreement) {
      return errorResponse("Agreement not found", 404, req);
    }

    // Verify the user matches the role
    if (role === "owner" && agreement.owner_id !== user.id) {
      return errorResponse("Forbidden: you are not the owner", 403, req);
    }
    if (role === "renter" && agreement.renter_id !== user.id) {
      return errorResponse("Forbidden: you are not the renter", 403, req);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, string | null> = {};

    if (role === "renter") {
      if (agreement.renter_signed_at) {
        return errorResponse("Renter already signed", 409, req);
      }
      updateData.renter_signed_at = now;
      updateData.status = agreement.status === "sent" ? "renter_signed" : agreement.status;
    } else {
      if (agreement.owner_signed_at) {
        return errorResponse("Owner already signed", 409, req);
      }
      updateData.owner_signed_at = now;
      updateData.status = agreement.status === "renter_signed" ? "owner_signed" : agreement.status;
    }

    // Check if both parties will have signed after this update
    const renterSigned = role === "renter" ? true : !!agreement.renter_signed_at;
    const ownerSigned = role === "owner" ? true : !!agreement.owner_signed_at;

    if (renterSigned && ownerSigned) {
      updateData.status = "active";
    }

    const { error: updateError } = await supabaseAdmin
      .from("rental_agreements")
      .update(updateData)
      .eq("id", agreementId);

    if (updateError) {
      console.error("Error updating agreement signature:", updateError);
      return errorResponse("Failed to record signature", 500, req);
    }

    // Generate 12 rent schedule rows when agreement becomes active
    if (updateData.status === "active") {
      const startDate = agreement.start_date
        ? new Date(agreement.start_date)
        : new Date();

      const schedules = Array.from({ length: 12 }, (_, i) => {
        const dueDate = addMonths(startDate, i);
        return {
          agreement_id: agreementId,
          property_id: agreement.property_id,
          renter_id: agreement.renter_id,
          owner_id: agreement.owner_id,
          due_date: format(dueDate, "yyyy-MM-dd"),
          amount: agreement.monthly_rent,
          status: "upcoming",
        };
      });

      const { error: scheduleError } = await supabaseAdmin
        .from("rent_schedules")
        .insert(schedules);

      if (scheduleError) {
        console.error("Error creating rent schedules:", scheduleError);
        // Non-fatal: agreement is active, schedules can be recreated
      }

      // Notify both parties that agreement is active
      const { data: property } = await supabaseAdmin
        .from("properties")
        .select("quartier, address")
        .eq("id", agreement.property_id)
        .single();

      const propertyLocation = (property as { quartier?: string; address?: string } | null)?.quartier || (property as any)?.address || "votre bien";

      await notifyUser(
        agreement.renter_id,
        "payments",
        "Contrat de location activé",
        `Votre contrat pour le bien au ${propertyLocation} est maintenant actif. Vos paiements mensuels sont programmés.`,
        { type: "agreement_active", agreementId }
      );

      await notifyUser(
        agreement.owner_id,
        "payments",
        "Contrat de location activé",
        `Le contrat pour le bien au ${propertyLocation} est signé par les deux parties et maintenant actif.`,
        { type: "agreement_active", agreementId }
      );
    } else {
      // Notify the other party to sign
      const { data: property } = await supabaseAdmin
        .from("properties")
        .select("quartier, address")
        .eq("id", agreement.property_id)
        .single();

      const propertyLocation2 = (property as { quartier?: string; address?: string } | null)?.quartier || (property as any)?.address || "votre bien";

      if (role === "renter") {
        await notifyUser(
          agreement.owner_id,
          "viewingRequests",
          "Le locataire a signé",
          `Le locataire a signé le contrat pour le bien au ${propertyLocation2}. À vous de signer pour l'activer.`,
          { type: "agreement_renter_signed", agreementId }
        );
      }
    }

    return cors(
      NextResponse.json({ success: true, status: updateData.status }),
      req
    );
  } catch (error) {
    console.error("Error in POST /api/rental-agreements/[id]/sign:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
