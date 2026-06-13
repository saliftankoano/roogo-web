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
import { captureServerEvent } from "@/lib/posthog-server";
import { listingBaseSchema } from "@/lib/validations";
import { normalizeKuulaVirtualTourUrl } from "@/lib/virtual-tour";
import { JOURNALIER_LISTING_PUBLICATION_FEE } from "@/lib/journalier-pricing";
import { qualifyReferralForTransaction } from "@/lib/referrals";
import { notifyRentersOfNewMatchingProperty } from "@/lib/matching-property-notifications";
import { translatePropertyIfNeeded } from "@/lib/property-translations";
import { sanitizeForStorage } from "@/lib/text-sanitize";

const MONTHLY_FREE_SUCCESS_FEE_RATE_BPS = 5000;
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

    // 5. Parse and validate request body
    console.log("Parsing request body...");
    const body = await req.json();
    const { listingData } = body;

    if (!listingData) {
      console.error("Missing listingData");
      return errorResponse("Missing listingData in request body", 400, req);
    }

    const normalizedListingData = {
      ...listingData,
      frequence: listingData.frequence ?? "mensuel",
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

    // 5c. owner_id: only staff/founder may set it; validate user exists and is owner/agent
    const ownerId = parsedListingData.owner_id;
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

    // 7. Map interdiction IDs to labels (plain text)
    const interdictionsLabels = convertIdsToLabels(
      parsedListingData.interdictions,
    );
    const dosAndDonts = Array.isArray(parsedListingData.dosAndDonts)
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
    const isFreeSuccessFeeListing =
      listingPaymentMode === "free_success_fee";
    const effectiveAddOns = isFreeSuccessFeeListing
      ? []
      : (parsedListingData.add_ons ?? []);
    const effectiveTierId =
      listingPaymentMode === "upfront_package"
        ? (parsedListingData.tier_id ?? null)
        : "essentiel";

    if (isFreeSuccessFeeListing && (parsedListingData.add_ons?.length ?? 0) > 0) {
      return errorResponse(
        "Les options payantes nécessitent un pack de publication.",
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

    // Calculate open house limit with add-ons
    let openHouseLimit = selectedTier?.open_house_limit || null;
    if (openHouseLimit !== null && effectiveAddOns.includes("open_house")) {
      openHouseLimit += 1;
    }

    // Staff listings are automatically verified (en_ligne), owner/agent listings need approval
    const propertyStatus = isStaffOrFounder ? "en_ligne" : "en_attente";

    const dailyCautionValue = (() => {
      if (!isDailyListing) return null;

      const cautionType = parsedListingData.cautionType ?? "aucune";
      const cautionValue = parsedListingData.cautionValeur ?? null;

      if (typeof cautionValue !== "number") return null;
      if (cautionType === "pourcentage") return Math.min(cautionValue, 50);
      if (cautionType === "fixe") return Math.min(cautionValue, 50_000);
      return cautionValue;
    })();

    const propertyData = {
      agent_id: parsedListingData.owner_id || user.id,
      description: sanitizeString(parsedListingData.description) || null,
      price: parsedListingData.prixMensuel,
      listing_type: "louer" as const,
      property_type: parsedListingData.type,
      status: propertyStatus as "en_attente" | "en_ligne",
      bedrooms: parsedListingData.chambres || null,
      bathrooms: parsedListingData.sdb || null,
      area: parsedListingData.superficie || null,
      parking_spaces: parsedListingData.vehicules || null,
      address: `${sanitizeString(parsedListingData.quartier)}, ${sanitizeString(parsedListingData.ville)}`,
      city: parsedListingData.ville,
      quartier: sanitizeString(parsedListingData.quartier),
      latitude: parsedListingData.latitude || null,
      longitude: parsedListingData.longitude || null,
      caution_mois:
        parsedListingData.frequence === "journalier"
          ? null
          : (parsedListingData.cautionMois ?? null),
      loyer_avance_mois:
        parsedListingData.frequence === "journalier"
          ? 1
          : parsedListingData.loyerAvanceMois || 1,
      interdictions: interdictionsLabels,
      dos_and_donts: dosAndDonts,
      period: parsedListingData.frequence === "journalier" ? "day" : "month",
      frequence: parsedListingData.frequence,
      sejour_minimum:
        parsedListingData.frequence === "journalier"
          ? (parsedListingData.sejour_minimum ?? 1)
          : null,
      capacite_max:
        parsedListingData.frequence === "journalier"
          ? (parsedListingData.capacite_max ?? 2)
          : null,
      caution_type:
        parsedListingData.frequence === "journalier"
          ? (parsedListingData.cautionType ?? "aucune")
          : null,
      caution_valeur:
        parsedListingData.frequence === "journalier" ? dailyCautionValue : null,
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
      // Set published_at for staff listings since they go live immediately
      published_at: isStaffOrFounder ? new Date().toISOString() : null,
      // Only staff/founder may mark a listing as test (hidden from public)
      is_test: isStaffOrFounder ? parsedListingData.is_test === true : false,
      virtual_tour_url: isStaffOrFounder ? virtualTourUrl : null,
    };

    // 9. Insert property
    console.log(
      "Inserting property into database...",
      isStaffOrFounder ? "(Staff listing - auto-verified)" : "",
    );
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .insert(propertyData)
      .select()
      .single();

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

    if (propertyStatus === "en_ligne" && propertyData.is_test === false) {
      await translatePropertyIfNeeded(propertyId).catch((error) => {
        console.error(
          "Property translation on auto-live create failed:",
          error,
        );
      });
    }

    // 10. Create deferred fee or link transaction record.
    const deferredSuccessFeeAmount =
      isFreeSuccessFeeListing && propertyData.is_test === false
        ? Math.round(
            (parsedListingData.prixMensuel *
              MONTHLY_FREE_SUCCESS_FEE_RATE_BPS) /
              10000,
          )
        : 0;

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

    // 11. Link amenities
    if (
      parsedListingData.equipements &&
      Array.isArray(parsedListingData.equipements) &&
      parsedListingData.equipements.length > 0
    ) {
      console.log("Linking amenities:", parsedListingData.equipements);
      const { data: amenities, error: amenitiesError } = await supabase
        .from("amenities")
        .select("id, name")
        .in("name", parsedListingData.equipements);

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
        isVerified: isStaffOrFounder,
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
