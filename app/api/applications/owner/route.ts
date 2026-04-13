import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * GET /api/applications/owner
 * Returns all applications for properties owned/managed by the authenticated user.
 * Uses service role key — bypasses RLS entirely.
 */
export async function GET(req: Request) {
  try {
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

    const { data, error } = await supabaseAdmin
      .from("applications")
      .select(`
        id,
        property_id,
        user_id,
        status,
        created_at,
        reviewed_at,
        rejection_reason,
        applicant:users!applications_user_id_fkey(full_name, phone),
        property:properties!applications_property_id_fkey(quartier, address, agent_id)
      `)
      .eq("properties.agent_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching owner applications:", error);
      return errorResponse("Failed to fetch applications", 500, req);
    }

    // Filter client-side to only include applications for this owner's properties
    // (PostgREST filter on embedded resource without !inner nullifies the embed but still returns the row)
    const applications = (data || [])
      .filter((app: any) => app.property !== null && app.property?.agent_id === user.id)
      .map((app: any) => ({
        id: app.id,
        property_id: app.property_id,
        user_id: app.user_id,
        status: app.status,
        created_at: app.created_at,
        reviewed_at: app.reviewed_at,
        rejection_reason: app.rejection_reason,
        applicant_name: app.applicant?.full_name || "Utilisateur inconnu",
        applicant_phone: app.applicant?.phone || null,
        property_location: app.property?.quartier || app.property?.address || "Propriété inconnue",
      }));

    return cors(NextResponse.json({ applications }), req);
  } catch (error) {
    console.error("Error in GET /api/applications/owner:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
