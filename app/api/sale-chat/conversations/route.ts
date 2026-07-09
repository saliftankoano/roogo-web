import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import {
  getOrCreateBuyerConversation,
  getOrCreateSellerConversation,
  isStaffType,
  SALE_CONVERSATION_PROPERTY_SELECT,
  withPropertyCover,
  type JoinedConversationProperty,
} from "@/lib/sale-chat";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// GET: inbox — the caller's conversations (their own threads; staff/founder see all).
export async function GET(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const select = `
      id, property_id, kind, user_id, staff_id, status,
      last_message_at, last_message_preview,
      unread_for_user, unread_for_staff,
      property:property_id ( ${SALE_CONVERSATION_PROPERTY_SELECT} ),
      user:user_id ( id, full_name, avatar_url, user_type )
    `;

    let query = supabaseAdmin
      .from("sale_conversations")
      .select(select)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    // Staff/founder see everything; everyone else sees their own threads.
    if (!isStaffType(user.user_type)) {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Sale conversations list failed:", error);
      return errorResponse("Failed to load conversations", 500, req);
    }

    // Collapse each joined property's photos into a single cover_url.
    const conversations = ((data ?? []) as unknown as {
      property: JoinedConversationProperty | null;
    }[]).map((c) => ({ ...c, property: withPropertyCover(c.property) }));

    return cors(
      NextResponse.json({ success: true, conversations }),
      req,
    );
  } catch (error) {
    console.error("GET /api/sale-chat/conversations:", error);
    return errorResponse("Failed to load conversations", 500, req);
  }
}

// POST: open (or fetch) the caller's conversation for a sale property. If the caller
// is the property's lister, this is their seller↔Roogo thread; otherwise it is a
// buyer↔Roogo thread.
export async function POST(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const payload = (await req.json()) as { propertyId?: unknown };
    const propertyId =
      typeof payload.propertyId === "string" ? payload.propertyId : "";
    if (!propertyId) return errorResponse("propertyId is required", 400, req);

    const { data: property, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select("id, agent_id, listing_type")
      .eq("id", propertyId)
      .maybeSingle();
    if (propertyError) {
      console.error("Sale conversation property lookup failed:", propertyError);
      return errorResponse("Failed to open conversation", 500, req);
    }
    if (!property) return errorResponse("Property not found", 404, req);
    if (property.listing_type !== "vendre")
      return errorResponse("Property is not for sale", 400, req);

    const isOwner = property.agent_id === user.id;
    const { conversation, reason } = isOwner
      ? await getOrCreateSellerConversation({ propertyId, sellerId: user.id })
      : await getOrCreateBuyerConversation({ propertyId, buyerId: user.id });

    if (!conversation) {
      if (reason === "not_a_sale")
        return errorResponse("Property is not for sale", 400, req);
      return errorResponse("Property not found", 404, req);
    }

    return cors(NextResponse.json({ success: true, conversation }), req);
  } catch (error) {
    console.error("POST /api/sale-chat/conversations:", error);
    return errorResponse("Failed to open conversation", 500, req);
  }
}
