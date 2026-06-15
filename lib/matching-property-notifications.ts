import { PROPERTY_TYPE_IDS, type PropertyTypeId } from "@/lib/constants";
import {
  countNotificationDeliveriesSince,
  reserveNotificationDelivery,
} from "@/lib/notification-deliveries";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { unescapeText } from "@/lib/text-sanitize";

const NEW_LISTING_EVENT_TYPE = "properties.newMatch";
const MAX_NEW_LISTING_PUSHES_PER_DAY = 1;

type CandidateUser = {
  id: string;
  clerk_id: string | null;
  preferred_city: string | null;
  budget_max: number | null;
  preferences: Record<string, unknown> | null;
};

type PublicPropertyForNotification = {
  id: string;
  agent_id: string;
  status: string | null;
  is_test: boolean | null;
  property_type: string | null;
  city: string | null;
  quartier: string | null;
  address: string | null;
  price: number | null;
  bedrooms: number | null;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/\s/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isPropertyType(value: string): value is PropertyTypeId {
  return (PROPERTY_TYPE_IDS as readonly string[]).includes(value);
}

function getPropertyTypeLabel(type: string | null | undefined) {
  if (!type) return "Bien";
  if (type === "célibatorium") return "Célibatorium";
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function hasNewListingPreferenceEnabled(
  preferences: Record<string, unknown> | null,
) {
  const notifications =
    preferences && typeof preferences.notifications === "object"
      ? (preferences.notifications as Record<string, unknown>)
      : null;

  return notifications?.newListings !== false;
}

function hasLocationMatch(
  property: PublicPropertyForNotification,
  candidate: CandidateUser,
) {
  const preferredLocation = normalizeText(
    candidate.preferences?.location ?? candidate.preferred_city,
  );

  if (!preferredLocation) return true;

  const searchablePropertyLocation = normalizeText(
    [property.city, property.quartier, property.address]
      .filter(Boolean)
      .join(" "),
  );

  return (
    searchablePropertyLocation.includes(preferredLocation) ||
    preferredLocation.includes(normalizeText(property.city)) ||
    preferredLocation.includes(normalizeText(property.quartier))
  );
}

function hasPropertyTypeMatch(
  property: PublicPropertyForNotification,
  preferences: Record<string, unknown> | null,
) {
  const preferredTypes = readStringArray(preferences?.propertyTypes).filter(
    isPropertyType,
  );
  if (preferredTypes.length === 0) return true;
  return Boolean(
    property.property_type &&
    preferredTypes.includes(property.property_type as PropertyTypeId),
  );
}

function hasBudgetMatch(
  property: PublicPropertyForNotification,
  candidate: CandidateUser,
) {
  const budget =
    readNumber(candidate.preferences?.budget) ?? candidate.budget_max;
  if (!budget || !property.price) return true;
  return property.price <= budget;
}

function hasRoomMatch(
  property: PublicPropertyForNotification,
  preferences: Record<string, unknown> | null,
) {
  const desiredRooms = readNumber(preferences?.rooms);
  if (!desiredRooms || !property.bedrooms) return true;
  return property.bedrooms >= desiredRooms;
}

function hasFurnishedMatch(
  preferences: Record<string, unknown> | null,
  amenityNames: string[],
) {
  const furnishedPreference = normalizeText(preferences?.furnished);
  if (
    !furnishedPreference ||
    furnishedPreference === "peu importe" ||
    furnishedPreference === "no preference"
  ) {
    return true;
  }

  const isFurnished = amenityNames.some(
    (name) => normalizeText(name) === "meuble",
  );

  if (furnishedPreference === "meuble" || furnishedPreference === "furnished") {
    return isFurnished;
  }

  if (
    furnishedPreference === "non meuble" ||
    furnishedPreference === "unfurnished"
  ) {
    return !isFurnished;
  }

  return true;
}

function matchesProperty(
  property: PublicPropertyForNotification,
  candidate: CandidateUser,
  amenityNames: string[],
) {
  if (candidate.id === property.agent_id) return false;
  if (!hasNewListingPreferenceEnabled(candidate.preferences)) return false;
  if (!hasLocationMatch(property, candidate)) return false;
  if (!hasPropertyTypeMatch(property, candidate.preferences)) return false;
  if (!hasBudgetMatch(property, candidate)) return false;
  if (!hasRoomMatch(property, candidate.preferences)) return false;
  if (!hasFurnishedMatch(candidate.preferences, amenityNames)) return false;
  return true;
}

export async function notifyRentersOfNewMatchingProperty(propertyId: string) {
  const { data: property, error: propertyError } = await supabaseAdmin
    .from("properties")
    .select(
      "id, agent_id, status, is_test, property_type, city, quartier, address, price, bedrooms",
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError || !property) {
    console.error(
      "Unable to load property for new-listing notifications:",
      propertyError,
    );
    return { attempted: 0, sent: 0 };
  }

  const publicProperty = property as PublicPropertyForNotification;

  if (publicProperty.status !== "en_ligne" || publicProperty.is_test) {
    return { attempted: 0, sent: 0 };
  }

  const { data: amenities } = await supabaseAdmin
    .from("property_amenities")
    .select("amenities(name)")
    .eq("property_id", propertyId);

  const amenityNames =
    amenities
      ?.map((row) => {
        const joined = row.amenities as
          | { name?: unknown }
          | { name?: unknown }[]
          | null;
        if (Array.isArray(joined)) return joined[0]?.name;
        return joined?.name;
      })
      .filter((name): name is string => typeof name === "string") ?? [];

  const { data: candidates, error: candidatesError } = await supabaseAdmin
    .from("users")
    .select("id, clerk_id, preferred_city, budget_max, preferences")
    .eq("user_type", "renter");

  if (candidatesError || !candidates) {
    console.error(
      "Unable to load renter candidates for new-listing notifications:",
      candidatesError,
    );
    return { attempted: 0, sent: 0 };
  }

  let attempted = 0;
  let sent = 0;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  for (const candidate of candidates as CandidateUser[]) {
    if (!matchesProperty(publicProperty, candidate, amenityNames)) continue;

    const todayCount = await countNotificationDeliveriesSince({
      userId: candidate.id,
      eventType: NEW_LISTING_EVENT_TYPE,
      since: startOfDay,
    });

    if (todayCount >= MAX_NEW_LISTING_PUSHES_PER_DAY) continue;

    const reserved = await reserveNotificationDelivery({
      userId: candidate.id,
      notificationType: "newListings",
      eventType: NEW_LISTING_EVENT_TYPE,
      subjectId: propertyId,
      metadata: { propertyId },
    });

    if (!reserved) continue;

    attempted += 1;

    const didSend = await notifyUserWithTemplate(
      candidate.id,
      "newListings",
      "properties.newMatch",
      {
        type: getPropertyTypeLabel(publicProperty.property_type),
        location:
          unescapeText(publicProperty.quartier || publicProperty.city) ||
          "Roogo",
      },
      {
        type: "new_matching_property",
        propertyId,
      },
    );

    if (didSend) sent += 1;
  }

  return { attempted, sent };
}
