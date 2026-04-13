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
 * PATCH /api/applications/:id/review
 * Owner accepts or rejects an application.
 * Body: { action: "approve" | "reject", reason?: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    // Auth
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
    const { action, reason } = body as { action: "approve" | "reject"; reason?: string };

    if (!action || !["approve", "reject"].includes(action)) {
      return errorResponse("action must be 'approve' or 'reject'", 400, req);
    }

    // Fetch application + verify ownership
    const { data: application, error: fetchError } = await supabaseAdmin
      .from("applications")
      .select("id, property_id, user_id, status, properties(agent_id, quartier, address)")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return errorResponse("Application not found", 404, req);
    }

    const property = application.properties as unknown as { agent_id: string; quartier?: string; address?: string } | null;
    if (!property || property.agent_id !== user.id) {
      return errorResponse("Forbidden", 403, req);
    }

    if (application.status !== "pending") {
      return errorResponse("Application already reviewed", 409, req);
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        rejection_reason: action === "reject" ? (reason || null) : null,
      })
      .eq("id", applicationId);

    if (updateError) {
      console.error("Error updating application:", updateError);
      return errorResponse("Failed to update application", 500, req);
    }

    // Notify the applicant
    const notifTitle = action === "approve"
      ? "Demande de visite acceptée"
      : "Demande de visite refusée";
    const propLocation = property.quartier || property.address || "votre bien";
    const notifBody = action === "approve"
      ? `Votre demande pour le bien au ${propLocation} a été acceptée.`
      : `Votre demande pour le bien au ${propLocation} a été refusée.${reason ? ` Raison: ${reason}` : ""}`;

    await notifyUser(application.user_id, "viewingRequests", notifTitle, notifBody, {
      type: "application_reviewed",
      applicationId,
      action,
    });

    return cors(NextResponse.json({ success: true, status: newStatus }), req);
  } catch (error) {
    console.error("Error in PATCH /api/applications/[id]/review:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
