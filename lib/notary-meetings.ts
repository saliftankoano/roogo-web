import { notifyUser } from "@/lib/push-notifications";
import { OFFICE_LABEL, OFFICE_MAPS_URL } from "@/lib/office";
import {
  getSaleConversation,
  postSaleMessage,
  type SaleConversationRow,
} from "@/lib/sale-chat";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Notary meeting at the Roogo office. Staff schedule it on a buyer↔Roogo thread; it
// posts a card into the thread and pushes the buyer immediately. Signing + payment
// happen offline at the meeting.

/**
 * Schedule a notary meeting on a buyer conversation. Posts a notary_meeting card and
 * notifies the buyer. Returns the created row, or an error reason.
 */
export async function scheduleNotaryMeeting(params: {
  conversationId: string;
  staffId: string;
  scheduledAt: string; // ISO timestamp
  notaryName?: string | null;
  notes?: string | null;
  locationLabel?: string | null;
  mapsUrl?: string | null;
}) {
  const { conversationId, staffId, scheduledAt } = params;

  const conversation = await getSaleConversation(conversationId);
  if (!conversation) return { ok: false as const, reason: "not_found" as const };
  if (conversation.kind !== "buyer")
    return { ok: false as const, reason: "not_a_buyer_thread" as const };

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()))
    return { ok: false as const, reason: "invalid_date" as const };

  const locationLabel = params.locationLabel?.trim() || OFFICE_LABEL;
  const mapsUrl = params.mapsUrl?.trim() || OFFICE_MAPS_URL;

  const { data: meeting, error: insertError } = await supabaseAdmin
    .from("notary_meetings")
    .insert({
      conversation_id: conversation.id,
      property_id: conversation.property_id,
      buyer_id: conversation.user_id,
      scheduled_at: when.toISOString(),
      location_label: locationLabel,
      maps_url: mapsUrl,
      status: "scheduled",
      assigned_staff_id: staffId,
      notary_name: params.notaryName?.trim() || null,
      notes: params.notes?.trim() || null,
    })
    .select("*")
    .single();
  if (insertError || !meeting) {
    throw insertError ?? new Error("Failed to insert notary meeting");
  }

  const { message } = await postSaleMessage({
    conversationId: conversation.id,
    senderId: staffId,
    senderType: "staff",
    messageType: "notary_meeting",
    body: "Rendez-vous notaire fixé",
    metadata: {
      notary_meeting_id: meeting.id,
      scheduled_at: when.toISOString(),
      location_label: locationLabel,
      maps_url: mapsUrl,
      notary_name: params.notaryName?.trim() || null,
    },
  });

  await supabaseAdmin
    .from("notary_meetings")
    .update({ message_id: message.id })
    .eq("id", meeting.id);

  // Immediate push to the buyer (high value, not coalesced).
  await notifyUser(
    conversation.user_id,
    "messages",
    "Rendez-vous notaire 🏛",
    "L'équipe Roogo a fixé votre rendez-vous de signature chez le notaire.",
    {
      type: "notary_meeting",
      conversationId: conversation.id,
      notaryMeetingId: meeting.id,
    },
  );

  return { ok: true as const, meetingId: meeting.id };
}

/** Cancel a scheduled notary meeting and notify the buyer. */
export async function cancelNotaryMeeting(params: {
  meetingId: string;
  staffId: string;
}) {
  const { meetingId } = params;

  const { data: meeting, error } = await supabaseAdmin
    .from("notary_meetings")
    .select("id, conversation_id, buyer_id, status")
    .eq("id", meetingId)
    .maybeSingle();
  if (error) throw error;
  if (!meeting) return { ok: false as const, reason: "not_found" as const };
  if (meeting.status !== "scheduled")
    return { ok: false as const, reason: "already_handled" as const };

  const { error: updateError } = await supabaseAdmin
    .from("notary_meetings")
    .update({ status: "cancelled" })
    .eq("id", meetingId)
    .eq("status", "scheduled");
  if (updateError) throw updateError;

  const conversation = (await getSaleConversation(
    meeting.conversation_id,
  )) as SaleConversationRow | null;
  if (conversation) {
    await notifyUser(
      conversation.user_id,
      "messages",
      "Rendez-vous notaire annulé",
      "Votre rendez-vous notaire a été annulé. L'équipe Roogo vous recontactera.",
      { type: "notary_meeting", conversationId: conversation.id },
    );
  }

  return { ok: true as const };
}
