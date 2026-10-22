import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCityLabel, getPropertyTypeLabel } from "@/lib/property-url";
import { formatXofAmount } from "@/lib/rental-period";
import type { PropertyLabels, PropertyRow } from "./property-context";

export const PROPERTY_COLUMNS =
  "id, property_type, listing_type, frequence, quartier, city, price, bedrooms, bathrooms, area, amenities, dos_and_donts, interdictions, description, status, sejour_minimum, capacite_max, caution_mois, loyer_avance_mois, images";

export const propertyLabels: PropertyLabels = {
  city: getCityLabel,
  type: getPropertyTypeLabel,
  amount: formatXofAmount,
};

export type ConversationRow = {
  id: string;
  user_id: string;
  property_id: string | null;
  title: string;
  voice_key: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export const CONVERSATION_COLUMNS =
  "id, user_id, property_id, title, voice_key, created_at, updated_at, archived_at";

type Viewer = { id: string; user_type: string | null };

export async function loadConversation(
  id: string,
): Promise<ConversationRow | null> {
  const { data } = await supabaseAdmin
    .from("studio_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as ConversationRow | null) ?? null;
}

/**
 * Every staff member and founder can read every project (decision of
 * 2026-10-09: the Studio history is shared with the whole team in V1).
 * Only the author can change a project.
 */
export function canReadConversation(viewer: Viewer, conv: ConversationRow) {
  return (
    conv.user_id === viewer.id ||
    viewer.user_type === "founder" ||
    viewer.user_type === "staff"
  );
}

export function canWriteConversation(viewer: Viewer, conv: ConversationRow) {
  return conv.user_id === viewer.id;
}

export async function loadPropertyRow(id: string): Promise<PropertyRow | null> {
  const { data } = await supabaseAdmin
    .from("property_details")
    .select(PROPERTY_COLUMNS)
    .eq("id", id)
    .eq("is_test", false)
    .maybeSingle();
  const row = (data as PropertyRow | null) ?? null;
  if (!row) return null;
  // The view's image list has no order. Use the gallery order staff saved
  // (sort_order 0 is the cover, is_primary), so videos and posters start on the cover.
  const { data: ordered } = await supabaseAdmin
    .from("property_images")
    .select("url, sort_order")
    .eq("property_id", id)
    .order("sort_order", { ascending: true });
  const urls = (ordered ?? []).map((r) => r.url as string).filter(Boolean);
  return urls.length ? { ...row, images: urls } : row;
}
