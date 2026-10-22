import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import {
  getSaleConversationWithProperty,
  loadSaleMessagesWithAttachments,
  markSaleConversationRead,
  resolveRole,
} from "@/lib/sale-chat";
import {
  getLatestMandateForProperty,
  getPrivateAskingPrice,
} from "@/lib/sale-mandate";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// GET one conversation + its message history. Marks the caller's role as read.
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
    // Includes the property join (type, quartier, price, cover_url) so the mobile
    // chat header can anchor the thread to the property it is about.
    const conversation = await getSaleConversationWithProperty(id);
    if (!conversation) return errorResponse("Conversation not found", 404, req);

    const role = resolveRole(conversation, {
      id: user.id,
      user_type: user.user_type,
    });
    if (!role) return errorResponse("Forbidden", 403, req);

    // Staff see who on the team wrote each message; owners and buyers only ever
    // see the Roogo team identity, so sender names are never included for them.
    const messages = await loadSaleMessagesWithAttachments(id, {
      includeSenderNames: role === "staff",
    });

    // Best-effort read receipt; don't fail the request on a counter update error.
    markSaleConversationRead(id, role).catch((e) =>
      console.error("markSaleConversationRead failed:", e),
    );

    // Staff only: the owner's own price, to prefill a new mandate. It is never
    // properties.price, which is Roogo's ladder price (owner price + 30%).
    let ownerPrice: number | null = null;
    if (role === "staff" && conversation.property_id) {
      const mandate = await getLatestMandateForProperty(conversation.property_id);
      ownerPrice =
        mandate?.desired_price != null
          ? Number(mandate.desired_price)
          : await getPrivateAskingPrice(conversation.property_id);
    }

    return cors(
      NextResponse.json({
        success: true,
        conversation,
        role,
        messages,
        ...(role === "staff" ? { owner_price: ownerPrice } : {}),
      }),
      req,
    );
  } catch (error) {
    console.error("GET /api/sale-chat/conversations/[id]:", error);
    return errorResponse("Failed to load conversation", 500, req);
  }
}
