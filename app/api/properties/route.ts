import { verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import {
  getOrSyncUserByClerkId,
  getSupabaseClient,
  createUserInSupabase,
  ClerkUserData,
} from "@/lib/user-sync";
import { convertIdsToLabels } from "@/lib/interdictions";
import { cors, corsOptions, errorResponse, safeError } from "@/lib/api-helpers";
import { checkRateLimit, listingLimiter } from "@/lib/rate-limit";
import { BOOST_DURATION_DAYS } from "@/lib/constants";
import {
  getOrCreateSellerConversation,
  postSaleMessage,
} from "@/lib/sale-chat";
import { captureServerEvent } from "@/lib/posthog-server";
import {
  listingBaseSchema,
  MAX_LISTING_PHOTOS,
  requireListingFieldsByType,
  SALE_EQUIPEMENT_IDS,
} from "@/lib/validations";
import { normalizeKuulaVirtualTourUrl } from "@/lib/virtual-tour";
import { JOURNALIER_LISTING_PUBLICATION_FEE } from "@/lib/journalier-pricing";
import {
  type AppliedReferral,
  applyReferralToQuote,
  computeListingSubmissionQuote,
  qualifyFreeListingReferral,
  qualifyReferralForTransaction,
  ReferralValidationError,
  validateReferralForUser,
} from "@/lib/referrals";
import { notifyRentersOfNewMatchingProperty } from "@/lib/matching-property-notifications";
import { translatePropertyIfNeeded } from "@/lib/property-translations";
import { isValidStoredPhone } from "@/lib/phone";
import { sanitizeForStorage } from "@/lib/text-sanitize";
import { getMembershipsForUser } from "@/lib/hotel-auth";
import { buildPropertyBaseSlug, normalizeQuartier } from "@/lib/property-url";

const MONTHLY_FREE_SUCCESS_FEE_RATE_BPS = 5000;
const FREE_LISTING_DEFAULT_TIER_ID = "premium";
type ListingPaymentMode =
  | "free_success_fee"
  | "upfront_package"
  | "daily_free";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Helper to sanitize string inputs — trims and strips HTML tags only.
// Never use validator.escape() here: HTML-encoding apostrophes etc. makes text
// unreadable in push notifications, React Native, and PDFs.
const sanitizeString = (str: string) => {
  if (typeof str !== "string") return str;
  return sanitizeForStorage(str);
};

// SEO slug (migration 056): generated once at creation, never regenerated,
// so public URLs stay permanent. Uniqueness via -2/-3 suffixes.
async function generateUniquePropertySlug(
  supabase: ReturnType<typeof getSupabaseClient>,
  fields: Parameters<typeof buildPropertyBaseSlug>[0],
): Promise<string> {
  const base = buildPropertyBaseSlug(fields);
  const { data, error } = await supabase
    .from("properties")
    .select("slug")
    .like("slug", `${base}%`);

  if (error) {
    console.error("Error checking slug uniqueness:", error);
    // Fall back to a random suffix rather than failing the listing creation.
    return `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const taken = new Set(
    ((data as { slug: string | null }[]) || []).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

const normalizeAmenityName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const hasFurnishedAmenity = (amenities: string[] | undefined) =>
  (amenities ?? []).some((amenity) =>
    ["meuble", "furnished"].includes(normalizeAmenityName(amenity)),
  );

export async function POST(req: Request) {
  console.log("Received POST request to /api/properties");
  try {
    // 1. Verify Clerk token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      console.error("Missing authorization token");
      return errorResponse("Missing token", 401, req);
    }

    let clerkUserId: string | undefined;
    try {
      console.log("Verifying Clerk token...");
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub as string | undefined;
      console.log("Clerk token verified for user:", clerkUserId);
    } catch (error) {
      console.error("Token verification failed:", error);
      return errorResponse("Invalid token", 401, req);
    }

    if (!clerkUserId) {
      return errorResponse("Unauthorized", 401, req);
    }

    // 2. Rate limiting
    const { success: rateLimitOk, headers: rateLimitHeaders } =
      await checkRateLimit(listingLimiter, clerkUserId);

    if (!rateLimitOk) {
      const response = errorResponse(
        "Too many listing requests. Please try again later.",
        429,
        req,
      );
      rateLimitHeaders.forEach((value, key) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // 3. Get user from Supabase
    console.log("Fetching Supabase user for Clerk ID:", clerkUserId);
    let user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) {
      console.error("User not found in Supabase");
      return errorResponse(
        "User not found. Please ensure Clerk webhooks are set up to sync users to Supabase.",
        404,
        req,
      );
    }
    console.log("Supabase user found:", user.id);

    // 4. Check if user is an owner, agent, staff, or founder
    let isStaffOrFounder =
      user.user_type === "staff" || user.user_type === "founder";
    let canCreateListing = ["owner", "agent", "staff", "founder"].includes(
      user.user_type,
    );

    if (!canCreateListing) {
      // user_type in Supabase may be stale — re-sync from Clerk and retry once
      console.log(
        "user_type check failed, re-syncing from Clerk:",
        user.user_type,
      );
      try {
        const { clerkClient } = await import("@clerk/nextjs/server");
        const client = await clerkClient();
        const clerkUser = await client.users.getUser(clerkUserId);
        const freshUser = await createUserInSupabase({
          id: clerkUser.id,
          email_addresses: clerkUser.emailAddresses.map((e) => ({
            email_address: e.emailAddress,
          })),
          first_name: clerkUser.firstName ?? undefined,
          last_name: clerkUser.lastName ?? undefined,
          image_url: clerkUser.imageUrl,
          phone_numbers: clerkUser.phoneNumbers?.map((p) => ({
            phone_number: p.phoneNumber,
          })),
          public_metadata:
            clerkUser.publicMetadata as ClerkUserData["public_metadata"],
          private_metadata:
            clerkUser.privateMetadata as ClerkUserData["private_metadata"],
          unsafe_metadata:
            clerkUser.unsafeMetadata as ClerkUserData["unsafe_metadata"],
        });
        if (
          freshUser &&
          ["owner", "agent", "staff", "founder"].includes(freshUser.user_type)
        ) {
          console.log("Re-sync succeeded, new user_type:", freshUser.user_type);
          user = freshUser as typeof user;
          isStaffOrFounder =
            user.user_type === "staff" || user.user_type === "founder";
          canCreateListing = true;
        } else {
          console.error(
            "User still unauthorized after re-sync:",
            freshUser?.user_type,
          );
          return errorResponse(
            "Only owners, agents, staff, or founders can create listings",
            403,
            req,
          );
        }
      } catch (syncError) {
        console.error("Failed to re-sync user from Clerk:", syncError);
        return errorResponse(
          "Only owners, agents, staff, or founders can create listings",
          403,
          req,
        );
      }
    }

    // Identity (KYC) verification is a recommendation, not a gate: owners/agents can
    // create listings without it. Staff still moderate every listing before it goes
    // live (en_attente), and sales keep their ownership-docs + signed-mandate gates.

    // 5. Parse and validate request body
    console.log("Parsing request body...");
    const body = await req.json();
    const { listingData } = body;

    if (!listingData) {
      console.error("Missing listingData");
      return errorResponse("Missing listingData in request body", 400, req);
    }

    const isSaleListing = listingData.listing_type === "vendre";
    const normalizedListingData = {
      ...listingData,
      // A sale has no rental frequency; only default it for rentals.
      frequence: isSaleListing
        ? listingData.frequence
        : (listingData.frequence ?? "mensuel"),
      cautionType: listingData.cautionType ?? listingData.caution_type,
      cautionValeur: listingData.cautionValeur ?? listingData.caution_valeur,
    };

    // 5b. Zod validation (server-side)
    // Note: We skip photos validation on server as they are uploaded separately
    const validationResult = listingBaseSchema
      .omit({ photos: true })
      .safeParse(normalizedListingData);
    if (!validationResult.success) {
      console.error("Validation failed:", validationResult.error.format());
      return errorResponse(
        "Données invalides: " + validationResult.error.issues[0].message,
        400,
        req,
      );
    }
    const parsedListingData = validationResult.data;

    // Type-conditional rules: terrain requires superficie and allows 0
    // rooms; every other type still requires ≥1 chambre and ≥1 douche.
    const typeIssue = requireListingFieldsByType(parsedListingData);
    if (typeIssue) {
      return errorResponse("Données invalides: " + typeIssue.message, 400, req);
    }

    // Hotel listings must be created by the admin of a hotel and are linked
    // to it: earnings key off the creator, and hotel members act on bookings
    // through this link.
    let hotelId: string | null = null;
    if (parsedListingData.type === "hotel") {
      const memberships = await getMembershipsForUser(user.id);
      const adminMembership = memberships.find((m) => m.role === "admin");
      if (!adminMembership) {
        return errorResponse(
          "Seul le gérant d'un hôtel peut publier une annonce d'hôtel",
          403,
          req,
        );
      }
      hotelId = adminMembership.hotelId;
      if (parsedListingData.listing_type !== "louer") {
        return errorResponse("Un hôtel ne peut pas être mis en vente", 400, req);
      }
      if (parsedListingData.frequence !== "journalier") {
        return errorResponse(
          "Un hôtel doit être en location journalière",
          400,
          req,
        );
      }
    }

    let virtualTourUrl: string | null = null;
    try {
      virtualTourUrl = normalizeKuulaVirtualTourUrl(
        parsedListingData.virtualTourUrl,
      );
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "Lien Kuula invalide",
        400,
        req,
      );
    }

    if (!isStaffOrFounder && virtualTourUrl) {
      return errorResponse(
        "Seuls les membres du staff peuvent ajouter une visite virtuelle",
        403,
        req,
      );
    }

    // 5c. Existing-account and direct-owner attribution are staff-only and
    // mutually exclusive. A direct owner is supported only for sale listings.
    const ownerId = parsedListingData.owner_id;
    const directOwner = parsedListingData.direct_owner;
    if (ownerId && directOwner) {
      return errorResponse(
        "owner_id and direct_owner are mutually exclusive",
        400,
        req,
      );
    }
    if (directOwner) {
      if (!isStaffOrFounder) {
        return errorResponse(
          "direct_owner is only allowed for staff or founder",
          403,
          req,
        );
      }
      if (!isSaleListing) {
        return errorResponse(
          "direct_owner is only allowed for sale listings",
          400,
          req,
        );
      }
      if (!isValidStoredPhone(directOwner.phone)) {
        return errorResponse("direct_owner.phone is invalid", 400, req);
      }
    }
    if (isStaffOrFounder && isSaleListing && !ownerId && !directOwner) {
      return errorResponse(
        "A staff-created sale must identify an existing or direct owner",
        400,
        req,
      );
    }
    if (ownerId) {
      if (!isStaffOrFounder) {
        return errorResponse(
          "owner_id is only allowed for staff or founder",
          400,
          req,
        );
      }
      const supabaseForCheck = getSupabaseClient();
      const { data: targetUser, error: targetError } = await supabaseForCheck
        .from("users")
        .select("id, user_type")
        .eq("id", ownerId)
        .single();
      if (targetError || !targetUser) {
        return errorResponse("owner_id: user not found", 400, req);
      }
      if (!["owner", "agent"].includes(targetUser.user_type ?? "")) {
        return errorResponse("owner_id: user must be owner or agent", 400, req);
      }
    }

    // 6. Get Supabase client (service role - bypasses RLS)
    const supabase = getSupabaseClient();

    // 7. Map interdiction IDs to labels (plain text). Interdictions and house
    // rules are tenant concepts — force them empty on sales so older app
    // builds (which render those form sections for every listing) can't write
    // tenant rules onto a sale listing.
    const interdictionsLabels = isSaleListing
      ? []
      : convertIdsToLabels(parsedListingData.interdictions);
    const dosAndDonts =
      !isSaleListing && Array.isArray(parsedListingData.dosAndDonts)
        ? parsedListingData.dosAndDonts
            .map((rule) => sanitizeString(rule))
            .filter((rule) => rule.length >= 2)
            .slice(0, 20)
        : [];

    // 8. Resolve listing payment mode, tier, and commission from database.
    const isDailyListing = parsedListingData.frequence === "journalier";
    const listingPaymentMode: ListingPaymentMode = isDailyListing
      ? "daily_free"
      : parsedListingData.listing_payment_mode === "upfront_package"
        ? "upfront_package"
        : parsedListingData.listing_payment_mode === "free_success_fee"
          ? "free_success_fee"
          : parsedListingData.payment_id
            ? "upfront_package"
            : "free_success_fee";
    // Sales are free to list but are NOT rentals — they must not trigger the
    // rental free-listing success-fee path (terms gate + 50%-of-first-month fee).
    const isFreeSuccessFeeListing =
      !isSaleListing && listingPaymentMode === "free_success_fee";
    const isFurnishedListing = hasFurnishedAmenity(
      parsedListingData.equipements,
    );
    const effectiveAddOns = isFreeSuccessFeeListing
      ? []
      : (parsedListingData.add_ons ?? []);
    const effectiveTierId =
      listingPaymentMode === "upfront_package"
        ? (parsedListingData.tier_id ?? null)
        : FREE_LISTING_DEFAULT_TIER_ID;

    if (isFreeSuccessFeeListing && (parsedListingData.add_ons?.length ?? 0) > 0) {
      return errorResponse(
        "Les options payantes nécessitent un pack de publication.",
        400,
        req,
      );
    }

    if (
      isFreeSuccessFeeListing &&
      !isDailyListing &&
      !isFurnishedListing &&
      parsedListingData.freeSuccessFeeTermsAccepted !== true
    ) {
      return errorResponse(
        "Vous devez accepter les conditions de publication gratuite.",
        400,
        req,
      );
    }

    if (!isDailyListing && listingPaymentMode === "upfront_package") {
      if (!effectiveTierId) {
        return errorResponse("Forfait requis", 400, req);
      }
      if (!parsedListingData.payment_id) {
        return errorResponse("Paiement requis pour ce forfait", 400, req);
      }
    }

    let selectedTier: {
      id: string;
      photo_limit: number;
      slot_limit: number;
      video_included: boolean;
      open_house_limit: number;
      has_badge: boolean;
      min_price: number;
    } | null = null;

    if (effectiveTierId) {
      const { data: tierData, error: tierError } = await supabase
        .from("listing_tiers")
        .select(
          "id, photo_limit, slot_limit, video_included, open_house_limit, has_badge, min_price",
        )
        .eq("id", effectiveTierId)
        .single();

      if (tierError || !tierData) {
        console.error("Tier not found:", tierError);
        return errorResponse("Forfait invalide", 400, req);
      }

      selectedTier = tierData;
    }

    let commissionPercentage = 0;
    if (listingPaymentMode === "upfront_package" && !isDailyListing) {
      const { data: configData, error: configError } = await supabase
        .from("listing_config")
        .select("commission_percentage")
        .eq("id", "default")
        .single();

      if (
        configError ||
        typeof configData?.commission_percentage !== "number"
      ) {
        console.error("Commission config missing:", configError);
        return errorResponse("Commission non configuree", 500, req);
      }

      commissionPercentage = configData.commission_percentage;
    }

    const tierPrice = isFreeSuccessFeeListing
      ? 0
      : selectedTier
        ? isDailyListing
          ? JOURNALIER_LISTING_PUBLICATION_FEE
          : selectedTier.min_price +
            parsedListingData.prixMensuel * commissionPercentage
        : null;

    const isBoosted = effectiveAddOns.includes("boost");
    let boostExpiresAt = null;
    if (isBoosted) {
      const date = new Date();
      date.setDate(date.getDate() + BOOST_DURATION_DAYS);
      boostExpiresAt = date.toISOString();
    }

    // Calculate slot limit with add-ons
    let slotLimit = selectedTier?.slot_limit || null;
    if (slotLimit !== null && effectiveAddOns.includes("extra_slots")) {
      slotLimit += 25;
    }

    // Calculate photo limit with add-ons
    let photoLimit = selectedTier?.photo_limit || null;
    if (photoLimit !== null && effectiveAddOns.includes("extra_photos")) {
      photoLimit += 5;
    }
    if (photoLimit !== null) {
      photoLimit = Math.min(photoLimit, MAX_LISTING_PHOTOS);
    }

    // Calculate open house limit with add-ons
    let openHouseLimit = selectedTier?.open_house_limit || null;
    if (openHouseLimit !== null && effectiveAddOns.includes("open_house")) {
      openHouseLimit += 1;
    }

    // Sale listings (vendre) must always start en_attente — they cannot go live
    // until ownership documents are staff-approved, even for staff/founder authors.
    const listingType = isSaleListing ? "vendre" : "louer";

    // Staff listings are automatically verified (en_ligne), owner/agent listings need approval.
    // Hotels always start en_attente regardless of author: room types are created
    // AFTER the property, and a hotel cannot go live with zero bookable rooms
    // (the status route enforces >= 1 active room type at publication).
    const propertyStatus =
      isStaffOrFounder && !isSaleListing && parsedListingData.type !== "hotel"
        ? "en_ligne"
        : "en_attente";
    const isTestListing = isStaffOrFounder
      ? parsedListingData.is_test === true
      : false;
    const deferredSuccessFeeAmount =
      isFreeSuccessFeeListing && isTestListing === false
        ? Math.round(
            (parsedListingData.prixMensuel *
              MONTHLY_FREE_SUCCESS_FEE_RATE_BPS) /
              10000,
          )
        : 0;

    const freeReferralCode =
      typeof parsedListingData.referralCode === "string"
        ? parsedListingData.referralCode.trim()
        : "";
    let freeListingReferral: AppliedReferral | null = null;
    if (
      freeReferralCode &&
      isFreeSuccessFeeListing &&
      !isDailyListing &&
      deferredSuccessFeeAmount > 0
    ) {
      try {
        const profile = await validateReferralForUser(supabase, {
          code: freeReferralCode,
          referredUserId: user.id,
          referredUserType: user.user_type,
        });
        const quote = await computeListingSubmissionQuote(supabase, {
          quoteMode: "free_success_fee",
          frequence: "mensuel",
          monthlyRent: parsedListingData.prixMensuel,
        });
        freeListingReferral = applyReferralToQuote(quote, profile);
      } catch (referralError) {
        if (referralError instanceof ReferralValidationError) {
          return errorResponse(referralError.message, referralError.status, req);
        }
        console.error("Error validating free listing referral:", referralError);
        return errorResponse("Failed to validate referral", 500, req);
      }
    }

    const dailyCautionValue = (() => {
      if (!isDailyListing) return null;

      const cautionType = parsedListingData.cautionType ?? "aucune";
      const cautionValue = parsedListingData.cautionValeur ?? null;

      if (typeof cautionValue !== "number") return null;
      if (cautionType === "pourcentage") return Math.min(cautionValue, 50);
      if (cautionType === "fixe") return Math.min(cautionValue, 50_000);
      return cautionValue;
    })();

    const cleanQuartier = normalizeQuartier(
      sanitizeString(parsedListingData.quartier),
    );

    const propertySlug = await generateUniquePropertySlug(supabase, {
      propertyType: parsedListingData.type,
      bedrooms: parsedListingData.chambres || null,
      listingType,
      quartier: cleanQuartier,
      city: parsedListingData.ville,
    });

    const propertyData = {
      agent_id: directOwner ? null : parsedListingData.owner_id || user.id,
      hotel_id: hotelId,
      slug: propertySlug,
      description: sanitizeString(parsedListingData.description) || null,
      // For a sale, the wizard price is the owner's NET asking price; Roogo's public
      // sale price is set later from the signed mandate. We seed `price` with the
      // asking as a placeholder (never shown publicly while en_attente).
      price: parsedListingData.prixMensuel,
      seller_asking_price: isSaleListing ? parsedListingData.prixMensuel : null,
      listing_type: listingType,
      property_type: parsedListingData.type,
      status: propertyStatus as "en_attente" | "en_ligne",
      bedrooms: parsedListingData.chambres || null,
      bathrooms: parsedListingData.sdb || null,
      area: parsedListingData.superficie ?? null,
      parking_spaces: parsedListingData.vehicules || null,
      address: `${cleanQuartier}, ${sanitizeString(parsedListingData.ville)}`,
      city: parsedListingData.ville,
      quartier: cleanQuartier,
      latitude: parsedListingData.latitude || null,
      longitude: parsedListingData.longitude || null,
      caution_mois: isSaleListing
        ? null
        : parsedListingData.frequence === "journalier"
          ? null
          : (parsedListingData.cautionMois ?? null),
      loyer_avance_mois: isSaleListing
        ? null
        : parsedListingData.frequence === "journalier"
          ? 1
          : parsedListingData.loyerAvanceMois || 1,
      interdictions: interdictionsLabels,
      dos_and_donts: dosAndDonts,
      // A sale has no recurring period / rental frequency.
      period: isSaleListing
        ? null
        : parsedListingData.frequence === "journalier"
          ? "day"
          : "month",
      frequence: isSaleListing ? null : parsedListingData.frequence,
      sejour_minimum:
        !isSaleListing && parsedListingData.frequence === "journalier"
          ? (parsedListingData.sejour_minimum ?? 1)
          : null,
      capacite_max:
        !isSaleListing && parsedListingData.frequence === "journalier"
          ? (parsedListingData.capacite_max ?? 2)
          : null,
      caution_type:
        !isSaleListing && parsedListingData.frequence === "journalier"
          ? (parsedListingData.cautionType ?? "aucune")
          : null,
      caution_valeur:
        !isSaleListing && parsedListingData.frequence === "journalier"
          ? dailyCautionValue
          : null,
      // Tier information
      tier_id: selectedTier?.id || null,
      tier_price: tierPrice,
      slot_limit: slotLimit,
      open_house_limit: openHouseLimit,
      photo_limit: photoLimit,
      video_included:
        selectedTier?.video_included ||
        effectiveAddOns.includes("video") ||
        false,
      has_premium_badge: selectedTier?.has_badge || false,
      payment_id: parsedListingData.payment_id || null,
      // Boost information
      is_boosted: isBoosted,
      boost_expires_at: boostExpiresAt,
      translation_source_locale: parsedListingData.source_locale ?? "fr",
      translation_status: "not_requested",
      translations: {},
      translated_at: null,
      translation_error: null,
      // published_at tracks actual publication: only set when the listing
      // really starts en_ligne (sales wait on ownership verification, hotels
      // wait on room types regardless of author).
      published_at:
        propertyStatus === "en_ligne" ? new Date().toISOString() : null,
      // Only staff/founder may mark a listing as test (hidden from public)
      is_test: isTestListing,
      virtual_tour_url: isStaffOrFounder ? virtualTourUrl : null,
    };

    // 9. Insert property
    console.log(
      "Inserting property into database...",
      isStaffOrFounder ? "(Staff listing - auto-verified)" : "",
    );
    let { data: property, error: propertyError } = await supabase
      .from("properties")
      .insert(propertyData)
      .select()
      .single();

    // Slug race: two identical listings created at the same time. Retry once
    // with a random suffix instead of failing the whole creation.
    if (propertyError?.code === "23505" && propertyError.message.includes("slug")) {
      const retry = await supabase
        .from("properties")
        .insert({
          ...propertyData,
          slug: `${propertySlug}-${Math.random().toString(36).slice(2, 6)}`,
        })
        .select()
        .single();
      property = retry.data;
      propertyError = retry.error;
    }

    if (propertyError || !property) {
      console.error(
        "Error creating property:",
        JSON.stringify(propertyError, null, 2),
      );
      return errorResponse(
        safeError(propertyError, "Failed to create property"),
        500,
        req,
      );
    }

    const propertyId = property.id;
    console.log(
      "Property created successfully:",
      propertyId,
      isStaffOrFounder ? "(Verified)" : "(Pending)",
    );

    if (directOwner) {
      const { error: intakeError } = await supabase.from("sale_intakes").insert({
        property_id: propertyId,
        owner_first_name: sanitizeString(directOwner.first_name),
        owner_last_name: sanitizeString(directOwner.last_name),
        owner_phone: directOwner.phone,
        phone_has_whatsapp: directOwner.phone_has_whatsapp,
        created_by: user.id,
        status: "unlinked",
      });
      if (intakeError) {
        console.error("Error creating sale intake:", intakeError);
        await supabase.from("properties").delete().eq("id", propertyId);
        return errorResponse("Failed to create direct sale intake", 500, req);
      }
    }

    if (propertyStatus === "en_ligne" && propertyData.is_test === false) {
      await translatePropertyIfNeeded(propertyId).catch((error) => {
        console.error(
          "Property translation on auto-live create failed:",
          error,
        );
      });
    }

    // For a sale, open the owner's seller↔Roogo thread with a welcome card so they
    // have a place to talk to the team while their listing is reviewed. Best-effort.
    if (isSaleListing && propertyData.agent_id) {
      try {
        const { conversation } = await getOrCreateSellerConversation({
          propertyId,
          sellerId: propertyData.agent_id,
        });
        if (conversation) {
          await postSaleMessage({
            conversationId: conversation.id,
            senderId: null,
            senderType: "system",
            messageType: "text",
            body:
              "Votre annonce a bien été reçue. L'équipe Roogo reviendra vers vous ici " +
              "avec une proposition de prix et de mandat. Vous pouvez aussi envoyer vos " +
              "documents de propriété (PUH, titre foncier…) directement dans cette " +
              "conversation. Nous vous les demanderons si besoin.",
          });
        }
      } catch (chatError) {
        console.error("Failed to open seller sale conversation:", chatError);
      }
    }

    // 10. Create deferred fee or link transaction record.
    if (deferredSuccessFeeAmount > 0) {
      const { error: feeError } = await supabase
        .from("property_listing_fees")
        .insert({
          property_id: propertyId,
          owner_id: propertyData.agent_id,
          fee_type: "success_fee",
          rate_bps: MONTHLY_FREE_SUCCESS_FEE_RATE_BPS,
          base_rent_amount: parsedListingData.prixMensuel,
          fee_amount: deferredSuccessFeeAmount,
          currency: "XOF",
          status: "pending",
          metadata: {
            created_by: user.id,
            listing_payment_mode: listingPaymentMode,
            tier_id: selectedTier?.id || null,
          },
        });

      if (feeError) {
        console.error("Error creating deferred listing fee:", feeError);
        return errorResponse("Failed to create listing fee", 500, req);
      }
    }

    if (freeListingReferral) {
      try {
        await qualifyFreeListingReferral(supabase, {
          referral: freeListingReferral,
          referredUserId: user.id,
          propertyId,
        });
      } catch (referralError) {
        console.error("Error qualifying free listing referral:", referralError);
      }
    }

    if (parsedListingData.payment_id) {
      console.log(
        "Linking transaction to property:",
        parsedListingData.payment_id,
      );
      const { data: updatedTransaction, error: txError } = await supabase
        .from("transactions")
        .update({
          property_id: propertyId,
          updated_at: new Date().toISOString(),
        })
        .eq("deposit_id", parsedListingData.payment_id)
        .select()
        .single();

      if (txError) {
        console.error("Error linking transaction to property:", txError);
      } else if (updatedTransaction) {
        console.log("Transaction linked successfully:", updatedTransaction.id);
        await supabase
          .from("properties")
          .update({ transaction_id: updatedTransaction.id })
          .eq("id", propertyId);

        try {
          await qualifyReferralForTransaction(supabase, {
            depositId: parsedListingData.payment_id,
            propertyId,
          });
        } catch (referralError) {
          console.error("Error qualifying referral:", referralError);
        }
      }
    }

    // 11. Link amenities. Sales only carry physical-asset amenities — rental
    // perks (wifi, meuble) selected before a client toggled to "vendre" are
    // stripped here, mirroring the interdictions/dos_and_donts guards above.
    const effectiveEquipements = isSaleListing
      ? (parsedListingData.equipements ?? []).filter((e) =>
          (SALE_EQUIPEMENT_IDS as readonly string[]).includes(e),
        )
      : (parsedListingData.equipements ?? []);
    if (effectiveEquipements.length > 0) {
      console.log("Linking amenities:", effectiveEquipements);
      const { data: amenities, error: amenitiesError } = await supabase
        .from("amenities")
        .select("id, name")
        .in("name", effectiveEquipements);

      if (!amenitiesError && amenities && amenities.length > 0) {
        const propertyAmenities = amenities.map((amenity) => ({
          property_id: propertyId,
          amenity_id: amenity.id,
        }));

        const { error: linkError } = await supabase
          .from("property_amenities")
          .insert(propertyAmenities);

        if (linkError) {
          console.error("Error linking amenities:", linkError);
        }
      }
    }

    await captureServerEvent(user.id, "property_listing_created", {
      property_id: propertyId,
      property_type: parsedListingData.type || null,
      price: parsedListingData.prixMensuel || 0,
      city: parsedListingData.ville || null,
      quartier: parsedListingData.quartier || null,
      tier_id: selectedTier?.id || null,
      listing_payment_mode: listingPaymentMode,
      deferred_success_fee_amount: deferredSuccessFeeAmount,
      status: propertyStatus,
      creator_type: user.user_type,
      is_boosted: isBoosted,
      photo_limit: photoLimit || 0,
      slot_limit: slotLimit || 0,
      open_house_limit: openHouseLimit || 0,
    });

    if (propertyStatus === "en_ligne") {
      await notifyRentersOfNewMatchingProperty(propertyId).catch((error) => {
        console.error("New matching property notification failed:", error);
      });
    }

    // 12. Return success response
    return cors(
      NextResponse.json({
        success: true,
        propertyId,
        // "Verified" means live: hotels start en_attente even for staff.
        isVerified: propertyStatus === "en_ligne",
        transactionId: parsedListingData.payment_id || null,
        listingPaymentMode,
        deferredSuccessFeeAmount,
      }),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/properties:", error);
    return errorResponse(
      safeError(error, "An unexpected error occurred"),
      500,
      req,
    );
  }
}
