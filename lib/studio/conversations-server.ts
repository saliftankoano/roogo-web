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

/** Staff read and write their own conversations; a founder can read all. */
export function canReadConversation(viewer: Viewer, conv: ConversationRow) {
  return conv.user_id === viewer.id || viewer.user_type === "founder";
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
  return (data as PropertyRow | null) ?? null;
}
