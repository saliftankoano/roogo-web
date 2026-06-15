import { notifyUser } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const SUPPORT_ATTACHMENTS_BUCKET = "support-attachments";

// Signed attachment URLs are short-lived; the mobile/admin clients refetch as needed.
const ATTACHMENT_URL_TTL_SECONDS = 60 * 60; // 1 hour

export type SupportAttachmentRow = {
  id: string;
  message_id: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
};

export type SupportMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_type: "user" | "staff";
  body: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Returns the caller's single support conversation, creating it on first contact.
 */
export async function getOrCreateConversation(userId: string) {
  const { data: existing, error: selectError } = await supabaseAdmin
    .from("support_conversations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabaseAdmin
    .from("support_conversations")
    .insert({ user_id: userId })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}

/**
 * Attaches a short-lived signed URL to each attachment row so clients can render it.
 */
export async function withSignedAttachmentUrls(
  attachments: SupportAttachmentRow[],
) {
  if (attachments.length === 0) return [];

  const { data, error } = await supabaseAdmin.storage
    .from(SUPPORT_ATTACHMENTS_BUCKET)
    .createSignedUrls(
      attachments.map((a) => a.storage_path),
      ATTACHMENT_URL_TTL_SECONDS,
    );

  if (error || !data) {
    console.error("Failed to sign support attachment URLs:", error);
    return attachments.map((a) => ({ ...a, url: null as string | null }));
  }

  const urlByPath = new Map(
    data.map((d) => [d.path ?? "", d.signedUrl ?? null]),
  );

  return attachments.map((a) => ({
    ...a,
    url: urlByPath.get(a.storage_path) ?? null,
  }));
}

/**
 * Loads a conversation's messages (oldest first) with signed attachment URLs.
 */
export async function loadMessagesWithAttachments(conversationId: string) {
  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("support_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (messagesError) throw messagesError;
  const rows = (messages ?? []) as SupportMessageRow[];

  if (rows.length === 0) return [];

  const { data: attachments, error: attachmentsError } = await supabaseAdmin
    .from("support_message_attachments")
    .select("*")
    .in(
      "message_id",
      rows.map((m) => m.id),
    );

  if (attachmentsError) throw attachmentsError;

  const signed = await withSignedAttachmentUrls(
    (attachments ?? []) as SupportAttachmentRow[],
  );

  const byMessage = new Map<string, typeof signed>();
  for (const a of signed) {
    const list = byMessage.get(a.message_id) ?? [];
    list.push(a);
    byMessage.set(a.message_id, list);
  }

  return rows.map((m) => ({
    ...m,
    attachments: byMessage.get(m.id) ?? [],
  }));
}

function previewFromMessage(body: string | null, hasAttachment: boolean) {
  const trimmed = (body ?? "").trim();
  if (trimmed) return trimmed.slice(0, 140);
  return hasAttachment ? "📷 Image" : "";
}

/**
 * Records a message, updates the conversation, and notifies the other side.
 */
export async function postSupportMessage(params: {
  conversationId: string;
  senderId: string;
  senderType: "user" | "staff";
  body: string | null;
  attachments?: {
    storagePath: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
  }[];
}) {
  const { conversationId, senderId, senderType, body } = params;
  const attachments = params.attachments ?? [];

  const { data: message, error: messageError } = await supabaseAdmin
    .from("support_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      sender_type: senderType,
      body: body ?? null,
    })
    .select("*")
    .single();

  if (messageError || !message) {
    throw messageError ?? new Error("Failed to insert support message");
  }

  if (attachments.length > 0) {
    const { error: attachmentError } = await supabaseAdmin
      .from("support_message_attachments")
      .insert(
        attachments.map((a) => ({
          message_id: message.id,
          storage_path: a.storagePath,
          mime_type: a.mimeType ?? null,
          size_bytes: a.sizeBytes ?? null,
          width: a.width ?? null,
          height: a.height ?? null,
        })),
      );

    if (attachmentError) throw attachmentError;
  }

  const preview = previewFromMessage(body, attachments.length > 0);
  const now = new Date().toISOString();

  // Update conversation counters/preview. The user sending bumps staff unread and
  // reopens the thread; staff sending bumps the user's unread.
  const conversationUpdate: Record<string, unknown> = {
    last_message_at: now,
    last_message_preview: preview,
  };

  if (senderType === "user") {
    const { data: conv } = await supabaseAdmin
      .from("support_conversations")
      .select("unread_for_staff")
      .eq("id", conversationId)
      .single();
    conversationUpdate.unread_for_staff = (conv?.unread_for_staff ?? 0) + 1;
    conversationUpdate.status = "open";
  } else {
    const { data: conv } = await supabaseAdmin
      .from("support_conversations")
      .select("unread_for_user")
      .eq("id", conversationId)
      .single();
    conversationUpdate.unread_for_user = (conv?.unread_for_user ?? 0) + 1;
    conversationUpdate.assigned_to_staff_id = senderId;
  }

  await supabaseAdmin
    .from("support_conversations")
    .update(conversationUpdate)
    .eq("id", conversationId);

  return { message, attachmentsCount: attachments.length };
}

/**
 * Push-notify all staff/founder users that a user sent a support message.
 */
export async function notifyStaffNewSupportMessage(params: {
  conversationId: string;
  userLabel: string;
  preview: string;
}) {
  const { data: staffUsers, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .in("user_type", ["staff", "founder"]);

  if (error || !staffUsers) {
    console.error("Unable to load staff users for support notification:", error);
    return;
  }

  await Promise.all(
    (staffUsers as { id: string }[]).map((staff) =>
      notifyUser(
        staff.id,
        "messages",
        `Support · ${params.userLabel}`,
        params.preview || "Nouveau message de support",
        { type: "support_message", conversationId: params.conversationId },
      ),
    ),
  );
}

/**
 * Push-notify a user that Roogo replied to their support thread.
 */
export async function notifyUserSupportReply(params: {
  userId: string;
  conversationId: string;
  preview: string;
}) {
  await notifyUser(
    params.userId,
    "messages",
    "Roogo Support",
    params.preview || "Vous avez une nouvelle réponse",
    { type: "support_reply", conversationId: params.conversationId },
  );
}
