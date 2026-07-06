import { notifyUser } from "@/lib/push-notifications";
import { postSaleMessage, type SaleConversationRow } from "@/lib/sale-chat";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type VisitSlot = { date: string; time: string };

// Notify staff/founders that a buyer requested a visit (action needed).
export async function notifyStaffVisitRequested(visitRequestId: string) {
  const { data: visit } = await supabaseAdmin
    .from("visit_requests")
    .select("id, conversation_id, property_id")
    .eq("id", visitRequestId)
    .maybeSingle();
  if (!visit) return;

  const { data: staffUsers } = await supabaseAdmin
    .from("users")
    .select("id")
    .in("user_type", ["staff", "founder"]);

  await Promise.all(
    (staffUsers ?? []).map((s: { id: string }) =>
      notifyUser(
        s.id,
        "messages",
        "Demande de visite",
        "Un acheteur a proposé des créneaux de visite à confirmer.",
        {
          type: "visit_requested",
          conversationId: visit.conversation_id,
          visitRequestId: visit.id,
        },
      ),
    ),
  );
}

// Confirm a visit: lock the chosen slot, assign staff, and post a confirmation
// card into the thread. Returns the updated row, or an error reason.
export async function confirmVisit(params: {
  visitRequestId: string;
  staffId: string;
  chosenSlot: VisitSlot;
}) {
  const { visitRequestId, staffId, chosenSlot } = params;

  const { data: visit, error } = await supabaseAdmin
    .from("visit_requests")
    .select("id, conversation_id, status")
    .eq("id", visitRequestId)
    .maybeSingle();
  if (error) throw error;
  if (!visit) return { ok: false as const, reason: "not_found" as const };
  if (visit.status !== "requested")
    return { ok: false as const, reason: "already_handled" as const };

  const scheduledAt = new Date(
    `${chosenSlot.date}T${chosenSlot.time}:00`,
  ).toISOString();

  const { message } = await postSaleMessage({
    conversationId: visit.conversation_id,
    senderId: staffId,
    senderType: "staff",
    messageType: "visit_confirmation",
    body: "Visite confirmée",
    metadata: { visit_request_id: visit.id, scheduled_slot: chosenSlot },
  });

  const { error: updateError } = await supabaseAdmin
    .from("visit_requests")
    .update({
      status: "confirmed",
      scheduled_at: scheduledAt,
      assigned_staff_id: staffId,
      confirmation_message_id: message.id,
    })
    .eq("id", visit.id)
    .eq("status", "requested");
  if (updateError) throw updateError;

  // Immediate push to the buyer (visit confirmation is high value, not coalesced).
  // There is no seller in a buyer thread; the owner is not involved in visits.
  const { data: conversation } = await supabaseAdmin
    .from("sale_conversations")
    .select("id, user_id")
    .eq("id", visit.conversation_id)
    .maybeSingle<Pick<SaleConversationRow, "id" | "user_id">>();

  if (conversation) {
    await notifyUser(
      conversation.user_id,
      "messages",
      "Visite confirmée ✅",
      "Votre visite a été planifiée par l'équipe Roogo.",
      {
        type: "visit_confirmed",
        conversationId: conversation.id,
        visitRequestId: visit.id,
      },
    );
  }

  return { ok: true as const, scheduledAt };
}
