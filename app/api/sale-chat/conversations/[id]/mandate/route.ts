import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { isStaffType, getSaleConversation, resolveRole } from "@/lib/sale-chat";
import { getLatestMandateForProperty, sendMandate } from "@/lib/sale-mandate";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { resolveClerkId } from "@/lib/request-auth";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// GET: the latest mandate for this conversation's property (seller or staff).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const { id } = await params;
    const conversation = await getSaleConversation(id);
    if (!conversation) return errorResponse("Conversation not found", 404, req);

    const role = resolveRole(conversation, {
      id: user.id,
      user_type: user.user_type,
    });
    if (!role) return errorResponse("Forbidden", 403, req);

    const mandate = await getLatestMandateForProperty(conversation.property_id);
    return cors(NextResponse.json({ success: true, mandate }), req);
  } catch (error) {
    console.error("GET sale-chat mandate:", error);
    return errorResponse("Failed to load mandate", 500, req);
  }
}

// POST: staff sends a mandate to the owner for this conversation's property.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!isStaffType(user.user_type))
      return errorResponse("Forbidden", 403, req);

    const { id } = await params;
    const conversation = await getSaleConversation(id);
    if (!conversation) return errorResponse("Conversation not found", 404, req);

    const payload = (await req.json()) as {
      sellerNetPrice?: unknown;
      listPrice?: unknown;
      exclusivityDays?: unknown;
      notes?: unknown;
    };
    const sellerNetPrice = Number(payload.sellerNetPrice);
    const listPrice = Number(payload.listPrice);
    const exclusivityDays =
      Number.isFinite(Number(payload.exclusivityDays)) &&
      Number(payload.exclusivityDays) > 0
        ? Math.round(Number(payload.exclusivityDays))
        : 90;
    const notes = typeof payload.notes === "string" ? payload.notes : null;

    const result = await sendMandate({
      propertyId: conversation.property_id,
      staffId: user.id,
      sellerNetPrice,
      listPrice,
      exclusivityDays,
      notes,
    });

    if (!result.ok) {
      const status =
        result.reason === "invalid_price" || result.reason === "list_below_net"
          ? 400
          : result.reason === "not_a_sale"
            ? 400
            : 404;
      return errorResponse(result.reason, status, req);
    }

    return cors(NextResponse.json({ success: true, mandate: result.mandate }), req);
  } catch (error) {
    console.error("POST sale-chat mandate:", error);
    return errorResponse("Failed to send mandate", 500, req);
  }
}
