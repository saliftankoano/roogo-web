import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import {
  getSaleConversation,
  postSaleMessage,
  resolveRole,
} from "@/lib/sale-chat";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyStaffVisitRequested } from "@/lib/sale-visits";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type SlotInput = { date?: unknown; time?: unknown };

// Buyer proposes up to 3 day+time options for a Roogo-run visit. We persist the
// request and post a visit_request card into the buyer↔Roogo thread so staff see it.
export async function POST(
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
    if (role !== "user" || conversation.kind !== "buyer") {
      return errorResponse("Only the buyer can request a visit", 403, req);
    }

    const payload = (await req.json()) as { slots?: unknown };
    const rawSlots = Array.isArray(payload.slots)
      ? (payload.slots as SlotInput[])
      : [];
    const slots = rawSlots
      .map((s) => ({
        date: typeof s.date === "string" ? s.date : "",
        time: typeof s.time === "string" ? s.time : "",
      }))
      .filter((s) => s.date && s.time)
      .slice(0, 3);

    if (slots.length === 0) {
      return errorResponse("Proposez au moins un créneau", 400, req);
    }

    const { data: visit, error: visitError } = await supabaseAdmin
      .from("visit_requests")
      .insert({
        conversation_id: id,
        property_id: conversation.property_id,
        buyer_id: user.id,
        proposed_slots: slots,
        status: "requested",
      })
      .select("id")
      .single();

    if (visitError || !visit) {
      console.error("Visit request insert failed:", visitError);
      return errorResponse("Failed to create visit request", 500, req);
    }

    const { message } = await postSaleMessage({
      conversationId: id,
      senderId: user.id,
      senderType: "user",
      messageType: "visit_request",
      body: "Demande de visite",
      metadata: { visit_request_id: visit.id, proposed_slots: slots },
    });

    // Link the card back to the request for rendering/idempotency.
    await supabaseAdmin
      .from("visit_requests")
      .update({ request_message_id: message.id })
      .eq("id", visit.id);

    notifyStaffVisitRequested(visit.id).catch((e) =>
      console.error("notifyStaffVisitRequested failed:", e),
    );

    return cors(
      NextResponse.json({ success: true, visitRequestId: visit.id }),
      req,
    );
  } catch (error) {
    console.error("POST /api/sale-chat/conversations/[id]/visit-requests:", error);
    return errorResponse("Failed to request visit", 500, req);
  }
}
