import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * DELETE /api/properties/:id/availability/:blockId
 * Owner only — remove an owner_block range.
 * Booked ranges (created by confirmed agreements) cannot be deleted manually.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  try {
    const { id: propertyId, blockId } = await params;

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

    // Verify ownership
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("id, agent_id")
      .eq("id", propertyId)
      .single();

    if (!property) return errorResponse("Property not found", 404, req);
    if (property.agent_id !== user.id)
      return errorResponse("Forbidden", 403, req);

    // Fetch the block to check its type
    const { data: block } = await supabaseAdmin
      .from("property_blocked_dates")
      .select("id, block_type, property_id")
      .eq("id", blockId)
      .single();

    if (!block) return errorResponse("Block not found", 404, req);
    if (block.property_id !== propertyId)
      return errorResponse("Forbidden", 403, req);
    if (block.block_type === "booked") {
      return errorResponse(
        "Les dates réservées ne peuvent pas être supprimées manuellement",
        403,
        req,
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("property_blocked_dates")
      .delete()
      .eq("id", blockId);

    if (deleteError) {
      console.error("Error deleting blocked dates:", deleteError);
      return errorResponse("Failed to unblock dates", 500, req);
    }

    return cors(NextResponse.json({ success: true }), req);
  } catch (error) {
    console.error(
      "Error in DELETE /api/properties/[id]/availability/[blockId]:",
      error,
    );
    return errorResponse("Internal server error", 500, req);
  }
}
