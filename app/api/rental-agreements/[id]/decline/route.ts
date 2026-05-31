import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";

interface AgreementPropertyLocation {
  quartier: string | null;
  address: string | null;
}

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * POST /api/rental-agreements/:id/decline
 * Renter declines a sent agreement.
 * Transitions status: sent → declined.
 * Returns support contact info for the frontend to surface.
 * Note: rent schedules are NOT affected — payment records remain intact.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: agreementId } = await params;

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

    const { data: agreement, error: fetchError } = await supabaseAdmin
      .from("rental_agreements")
      .select(
        "id, status, owner_id, renter_id, property_id, properties(quartier, address)",
      )
      .eq("id", agreementId)
      .single();

    if (fetchError || !agreement)
      return errorResponse("Agreement not found", 404, req);
    if (agreement.renter_id !== user.id)
      return errorResponse("Forbidden: you are not the renter", 403, req);
    if (agreement.status !== "sent")
      return errorResponse("Agreement is not in sent status", 409, req);

    const { error: updateError } = await supabaseAdmin
      .from("rental_agreements")
      .update({ status: "declined" })
      .eq("id", agreementId);

    if (updateError) {
      console.error("Error declining agreement:", updateError);
      return errorResponse("Failed to decline agreement", 500, req);
    }

    const property =
      (
        agreement.properties as unknown as AgreementPropertyLocation[] | null
      )?.[0] ?? null;
    const propertyLocation =
      property?.quartier || property?.address || "votre bien";

    try {
      await notifyUserWithTemplate(
        agreement.owner_id,
        "payments",
        "agreements.declined",
        { location: propertyLocation },
        { agreementId, action: "agreement_declined" },
      );
    } catch (e) {
      console.warn("Failed to notify owner:", e);
    }

    return cors(
      NextResponse.json({
        success: true,
        status: "declined",
        support: {
          phone: process.env.SUPPORT_PHONE || "+22600000000",
          whatsapp: process.env.SUPPORT_WHATSAPP || "+22600000000",
        },
      }),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/rental-agreements/[id]/decline:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
