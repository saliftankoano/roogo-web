import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser, isStaffOrFounder } from "@/lib/api-auth";
import { notifyStaffPropertySubmittedForReview } from "@/lib/staff-property-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const { id: propertyId } = await params;
    const { data: property, error } = await supabaseAdmin
      .from("properties")
      .select("id, agent_id")
      .eq("id", propertyId)
      .maybeSingle();

    if (error || !property) {
      return errorResponse("Property not found", 404, req);
    }

    if (!isStaffOrFounder(user) && property.agent_id !== user.id) {
      return errorResponse("Forbidden", 403, req);
    }

    const result = await notifyStaffPropertySubmittedForReview(propertyId);
    return cors(NextResponse.json({ success: true, notification: result }), req);
  } catch (error) {
    console.error("Error in POST /api/properties/[id]/submission-complete:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
