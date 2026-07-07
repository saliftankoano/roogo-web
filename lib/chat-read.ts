import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Marks a chat thread read for one side: zeroes that side's unread counter AND stamps
 * read_at on the OTHER party's un-read messages, so the sender's receipts flip to "Lu".
 * Shared by sale + support chat (call sites gate on the unread counter to avoid no-op
 * writes). `role` values ('user'|'staff') match the messages' sender_type values.
 */
export async function markConversationRead(params: {
  conversationsTable: "sale_conversations" | "support_conversations";
  messagesTable: "sale_messages" | "support_messages";
  conversationId: string;
  role: "user" | "staff";
}) {
  const { conversationsTable, messagesTable, conversationId, role } = params;
  const column = role === "user" ? "unread_for_user" : "unread_for_staff";

  await supabaseAdmin
    .from(conversationsTable)
    .update({ [column]: 0 })
    .eq("id", conversationId);

  // Stamp read_at on messages not sent by this side (best-effort).
  await supabaseAdmin
    .from(messagesTable)
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .is("read_at", null)
    .neq("sender_type", role);
}
