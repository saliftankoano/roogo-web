import { markConversationRead } from "@/lib/chat-read";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Per-property chat where Roogo is the only counterparty (broker model). Buyers and
// sellers never talk to each other. Each conversation has a `kind`:
//   * 'seller' — the owner ↔ Roogo (listing review, price negotiation, mandate)
//   * 'buyer'  — a buyer ↔ Roogo (interest, visits, notary meeting)
// `user_id` is the non-Roogo party; any staff/founder is the Roogo side of every thread.

export const SALE_CHAT_ATTACHMENTS_BUCKET = "sale-chat-attachments";

/**
 * Document types accepted as sale-chat attachments (mime -> storage extension).
 * PDF plus the office formats land titles, plans and receipts circulate in.
 */
export const SALE_CHAT_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
};

/** Storage extension for an accepted document mime type; null when unsupported. */
export function saleDocumentExtensionForMime(mime: string | null | undefined) {
  if (!mime) return null;
  return SALE_CHAT_DOCUMENT_TYPES[mime] ?? null;
}

const ATTACHMENT_URL_TTL_SECONDS = 60 * 60; // 1 hour

export type SaleConversationKind = "seller" | "buyer";
export type SaleRole = "user" | "staff";
export type SaleSenderType = SaleRole | "system";
export type SaleMessageType =
  | "text"
  | "voice"
  | "visit_request"
  | "visit_confirmation"
  | "mandate_offer"
  | "mandate_signed"
  | "notary_meeting";

export type SaleConversationRow = {
  id: string;
  property_id: string;
  kind: SaleConversationKind;
  user_id: string;
  staff_id: string | null;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_for_user: number;
  unread_for_staff: number;
};

export type SaleAttachmentRow = {
  id: string;
  message_id: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  /** Original file name for document attachments; null for images and voice notes. */
  file_name: string | null;
};

export type SaleMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_type: SaleSenderType;
  message_type: SaleMessageType;
  body: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

const STAFF_TYPES = new Set(["staff", "founder"]);

/**
 * Property fields embedded in conversation payloads, including the joined photos
 * used to resolve the cover. `property_images.url` is a public "listing"-bucket URL.
 */
export const SALE_CONVERSATION_PROPERTY_SELECT =
  "id, property_type, price, quartier, city, property_images ( url, is_primary )";

type JoinedPropertyImage = {
  url: string | null;
  is_primary: boolean | null;
};

export type JoinedConversationProperty = {
  id: string;
  property_type: string;
  price: number | null;
  quartier: string | null;
  city: string | null;
  property_images?: JoinedPropertyImage[] | null;
};

/**
 * Collapses the joined `property_images` into a single `cover_url`. Mirrors the
 * mobile feed's cover resolution (propertyFetchService.transformProperty): the
 * `is_primary` photo, else the first one. Null-safe: properties without photos
 * (or a null property join) yield `cover_url: null`.
 */
export function withPropertyCover<
  T extends { property_images?: JoinedPropertyImage[] | null },
>(property: T | null): (Omit<T, "property_images"> & { cover_url: string | null }) | null {
  if (!property) return null;
  const { property_images, ...rest } = property;
  const images = Array.isArray(property_images) ? property_images : [];
  const cover =
    images.find((img) => img?.is_primary && img.url) ??
    images.find((img) => !!img?.url);
  return { ...rest, cover_url: cover?.url ?? null };
}

export function isStaffType(userType: string | null | undefined) {
  return !!userType && STAFF_TYPES.has(userType);
}

/** First name only: staff members are shown by first name to other staff. */
export function firstNameFrom(fullName: string | null | undefined) {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

/**
 * Resolves the caller's role within a conversation. Any staff/founder resolves to
 * "staff" (the Roogo side of every thread); the thread's own user resolves to "user".
 */
export function resolveRole(
  conversation: Pick<SaleConversationRow, "user_id">,
  user: { id: string; user_type: string | null },
): SaleRole | null {
  if (isStaffType(user.user_type)) return "staff";
  if (user.id === conversation.user_id) return "user";
  return null;
}

/**
 * Returns the buyer↔Roogo conversation for (property, buyer), creating it on first
 * contact. The buyer cannot be the property's lister.
 */
export async function getOrCreateBuyerConversation(params: {
  propertyId: string;
  buyerId: string;
}) {
  const { propertyId, buyerId } = params;

  const { data: property, error: propertyError } = await supabaseAdmin
    .from("properties")
    .select("id, agent_id, listing_type")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError) throw propertyError;
  if (!property) return { conversation: null, reason: "not_found" as const };
  if (property.listing_type !== "vendre")
    return { conversation: null, reason: "not_a_sale" as const };
  if (property.agent_id === buyerId)
    return { conversation: null, reason: "own_listing" as const };

  return upsertConversation({ propertyId, userId: buyerId, kind: "buyer" });
}

/**
 * Returns the seller↔Roogo conversation for a property, creating it on first contact.
 * Used when a `vendre` listing is submitted and whenever the owner opens their thread.
 */
export async function getOrCreateSellerConversation(params: {
  propertyId: string;
  sellerId: string;
}) {
  const { propertyId, sellerId } = params;
  return upsertConversation({ propertyId, userId: sellerId, kind: "seller" });
}

async function upsertConversation(params: {
  propertyId: string;
  userId: string;
  kind: SaleConversationKind;
}) {
  const { propertyId, userId, kind } = params;

  const { data: existing, error: selectError } = await supabaseAdmin
    .from("sale_conversations")
    .select("*")
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing)
    return { conversation: existing as SaleConversationRow, reason: null };

  const { data: created, error: insertError } = await supabaseAdmin
    .from("sale_conversations")
    .insert({ property_id: propertyId, user_id: userId, kind })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return { conversation: created as SaleConversationRow, reason: null };
}

export async function getSaleConversation(conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from("sale_conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return (data as SaleConversationRow) ?? null;
}

/**
 * Conversation + embedded property (type, quartier, price, cover_url) for display
 * payloads. Auth-only callers should keep using getSaleConversation.
 */
export async function getSaleConversationWithProperty(conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from("sale_conversations")
    .select(`*, property:property_id ( ${SALE_CONVERSATION_PROPERTY_SELECT} )`)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { property, ...conversation } = data as unknown as SaleConversationRow & {
    property: JoinedConversationProperty | null;
  };
  return {
    ...(conversation as SaleConversationRow),
    property: withPropertyCover(property),
  };
}

export async function withSignedSaleAttachmentUrls(
  attachments: SaleAttachmentRow[],
) {
  if (attachments.length === 0) return [];
  const { data, error } = await supabaseAdmin.storage
    .from(SALE_CHAT_ATTACHMENTS_BUCKET)
    .createSignedUrls(
      attachments.map((a) => a.storage_path),
      ATTACHMENT_URL_TTL_SECONDS,
    );

  if (error || !data) {
    console.error("Failed to sign sale attachment URLs:", error);
    return attachments.map((a) => ({ ...a, url: null as string | null }));
  }
  const urlByPath = new Map(data.map((d) => [d.path ?? "", d.signedUrl ?? null]));
  return attachments.map((a) => ({
    ...a,
    url: urlByPath.get(a.storage_path) ?? null,
  }));
}

/**
 * Loads a conversation's messages. `includeSenderNames` attaches the staff sender's
 * first name (`sender_name`) to staff messages. It must ONLY be true for staff/founder
 * requesters: owners and buyers see one Roogo team identity, never individual names.
 */
export async function loadSaleMessagesWithAttachments(
  conversationId: string,
  options?: { includeSenderNames?: boolean },
) {
  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("sale_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (messagesError) throw messagesError;
  let rows = (messages ?? []) as (SaleMessageRow & {
    sender_name?: string | null;
  })[];
  if (rows.length === 0) return [];

  if (options?.includeSenderNames) {
    const staffIds = [
      ...new Set(
        rows
          .filter((m) => m.sender_type === "staff" && m.sender_id)
          .map((m) => m.sender_id as string),
      ),
    ];
    if (staffIds.length > 0) {
      const { data: senders, error: sendersError } = await supabaseAdmin
        .from("users")
        .select("id, full_name")
        .in("id", staffIds);
      if (sendersError) throw sendersError;
      const nameById = new Map(
        (senders ?? []).map((u) => [
          u.id as string,
          firstNameFrom(u.full_name as string | null),
        ]),
      );
      rows = rows.map((m) =>
        m.sender_type === "staff" && m.sender_id
          ? { ...m, sender_name: nameById.get(m.sender_id) ?? null }
          : m,
      );
    }
  }

  const { data: attachments, error: attachmentsError } = await supabaseAdmin
    .from("sale_message_attachments")
    .select("*")
    .in(
      "message_id",
      rows.map((m) => m.id),
    );
  if (attachmentsError) throw attachmentsError;

  const signed = await withSignedSaleAttachmentUrls(
    (attachments ?? []) as SaleAttachmentRow[],
  );
  const byMessage = new Map<string, typeof signed>();
  for (const a of signed) {
    const list = byMessage.get(a.message_id) ?? [];
    list.push(a);
    byMessage.set(a.message_id, list);
  }
  return rows.map((m) => ({ ...m, attachments: byMessage.get(m.id) ?? [] }));
}

function previewFromMessage(
  body: string | null,
  messageType: SaleMessageType,
  attachments: { mimeType?: string | null }[],
) {
  if (messageType === "visit_request") return "📅 Demande de visite";
  if (messageType === "visit_confirmation") return "✅ Visite confirmée";
  if (messageType === "mandate_offer") return "📄 Proposition de mandat";
  if (messageType === "mandate_signed") return "✍️ Mandat signé";
  if (messageType === "notary_meeting") return "🏛 Rendez-vous notaire";
  if (messageType === "voice") return "Note vocale";
  const trimmed = (body ?? "").trim();
  if (trimmed) return trimmed.slice(0, 140);
  if (attachments.length === 0) return "";
  const mime = attachments[0]?.mimeType ?? "";
  // A non-image attachment on a text message is a document (PDF, Word, ...).
  if (mime && !mime.startsWith("image/")) return "Document";
  return "📷 Image";
}

/**
 * Records a message, updates the conversation preview, and bumps the unread counter
 * of the side that did NOT send it. A 'system' message bumps both sides. When a staff
 * member is the first to reply, records who picked the thread up (staff_id).
 */
export async function postSaleMessage(params: {
  conversationId: string;
  senderId: string | null;
  senderType: SaleSenderType;
  messageType?: SaleMessageType;
  body: string | null;
  metadata?: Record<string, unknown> | null;
  attachments?: {
    storagePath: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
    fileName?: string | null;
  }[];
}) {
  const messageType = params.messageType ?? "text";
  const attachments = params.attachments ?? [];

  const { data: message, error: messageError } = await supabaseAdmin
    .from("sale_messages")
    .insert({
      conversation_id: params.conversationId,
      sender_id: params.senderId,
      sender_type: params.senderType,
      message_type: messageType,
      body: params.body ?? null,
      metadata: params.metadata ?? null,
    })
    .select("*")
    .single();

  if (messageError || !message) {
    throw messageError ?? new Error("Failed to insert sale message");
  }

  if (attachments.length > 0) {
    const { error: attachmentError } = await supabaseAdmin
      .from("sale_message_attachments")
      .insert(
        attachments.map((a) => ({
          message_id: message.id,
          storage_path: a.storagePath,
          mime_type: a.mimeType ?? null,
          size_bytes: a.sizeBytes ?? null,
          width: a.width ?? null,
          height: a.height ?? null,
          file_name: a.fileName ?? null,
        })),
      );
    if (attachmentError) throw attachmentError;
  }

  const preview = previewFromMessage(params.body, messageType, attachments);
  const now = new Date().toISOString();

  const { data: conv } = await supabaseAdmin
    .from("sale_conversations")
    .select("unread_for_user, unread_for_staff, staff_id")
    .eq("id", params.conversationId)
    .single();

  // Bump unread for the side that did not send. A 'system' message bumps both.
  const update: Record<string, unknown> = {
    last_message_at: now,
    last_message_preview: preview,
    status: "open",
  };
  if (params.senderType !== "user")
    update.unread_for_user = (conv?.unread_for_user ?? 0) + 1;
  if (params.senderType !== "staff")
    update.unread_for_staff = (conv?.unread_for_staff ?? 0) + 1;
  // Record the first staff member to engage (for display only).
  if (params.senderType === "staff" && params.senderId && !conv?.staff_id)
    update.staff_id = params.senderId;

  await supabaseAdmin
    .from("sale_conversations")
    .update(update)
    .eq("id", params.conversationId);

  return { message: message as SaleMessageRow, attachmentsCount: attachments.length };
}

/**
 * Resets the unread counter for one side and marks delivered messages read.
 */
export async function markSaleConversationRead(
  conversationId: string,
  role: SaleRole,
) {
  await markConversationRead({
    conversationsTable: "sale_conversations",
    messagesTable: "sale_messages",
    conversationId,
    role,
  });
}
