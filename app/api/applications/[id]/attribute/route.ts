import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * POST /api/applications/:id/attribute
 * Owner attributes (finalizes) a tenant for a property.
 * - Sets chosen application status = 'attributed'
 * - Rejects all other pending/approved applications for same property
 * - Sets property.status = 'finalized'
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: applicationId } = await params;

    // Auth
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

    // Fetch application + verify ownership
    const { data: application, error: fetchError } = await supabaseAdmin
      .from("applications")
      .select(
        "id, property_id, user_id, status, properties(agent_id, quartier, address)",
      )
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return errorResponse("Application not found", 404, req);
    }

    const property = application.properties as unknown as {
      agent_id: string;
      quartier?: string;
      address?: string;
    } | null;
    if (!property || property.agent_id !== user.id) {
      return errorResponse("Forbidden", 403, req);
    }

    if (application.status === "attributed") {
      return errorResponse("Tenant already attributed", 409, req);
    }

    // Set chosen application to 'attributed'
    const { error: attrError } = await supabaseAdmin
      .from("applications")
      .update({
        status: "attributed",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (attrError) {
      console.error("Error attributing application:", attrError);
      return errorResponse("Failed to attribute tenant", 500, req);
    }

    // Reject all other pending/approved applications for same property
    const { data: otherApps } = await supabaseAdmin
      .from("applications")
      .select("id, user_id")
      .eq("property_id", application.property_id)
      .in("status", ["pending", "approved"])
      .neq("id", applicationId);

    if (otherApps && otherApps.length > 0) {
      const otherIds = otherApps.map((a: { id: string }) => a.id);
      await supabaseAdmin
        .from("applications")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          rejection_reason: "Un autre locataire a été sélectionné.",
        })
        .in("id", otherIds);

      // Notify rejected applicants
      for (const app of otherApps) {
        await notifyUserWithTemplate(
          (app as { id: string; user_id: string }).user_id,
          "viewingRequests",
          "applications.rejectedOtherSelected",
          {
            location: property.quartier || property.address || "votre bien",
          },
          {
            type: "application_rejected",
            applicationId: (app as { id: string }).id,
          },
        );
      }
    }

    // Finalize the property
    await supabaseAdmin
      .from("properties")
      .update({ status: "finalized" })
      .eq("id", application.property_id);

    // Notify the attributed tenant
    await notifyUserWithTemplate(
      application.user_id,
      "viewingRequests",
      "applications.tenantAttributed",
      {
        location: property.quartier || property.address || "votre bien",
      },
      { type: "tenant_attributed", applicationId },
    );

    return cors(
      NextResponse.json({ success: true, status: "attributed" }),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/applications/[id]/attribute:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
