import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";
import { notifyUser } from "@/lib/push-notifications";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * POST /api/rental-agreements/:id/send
 * Owner sends the draft agreement to the renter for review.
 * Transitions status: draft → sent.
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
      const { sub } = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const { data: agreement, error: fetchError } = await supabaseAdmin
      .from("rental_agreements")
      .select("id, status, owner_id, renter_id, property_id, properties(quartier, address)")
      .eq("id", agreementId)
      .single();

    if (fetchError || !agreement) return errorResponse("Agreement not found", 404, req);
    if (agreement.owner_id !== user.id) return errorResponse("Forbidden: you are not the owner", 403, req);
    if (agreement.status !== "draft") return errorResponse("Agreement is not in draft status", 409, req);

    const { error: updateError } = await supabaseAdmin
      .from("rental_agreements")
      .update({ status: "sent" })
      .eq("id", agreementId);

    if (updateError) {
      console.error("Error sending agreement:", updateError);
      return errorResponse("Failed to send agreement", 500, req);
    }

    const propertyLocation = (agreement.properties as any)?.quartier || (agreement.properties as any)?.address || "votre bien";

    try {
      await notifyUser(
        agreement.renter_id,
        "payments",
        "Votre contrat de bail est prêt",
        `Le propriétaire a préparé le contrat pour le bien au ${propertyLocation}. Consultez-le et signez.`,
        { agreementId, action: "review_agreement" },
      );
    } catch (e) {
      console.warn("Failed to notify renter:", e);
    }

    return cors(NextResponse.json({ success: true, status: "sent" }), req);
  } catch (error) {
    console.error("Error in POST /api/rental-agreements/[id]/send:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
