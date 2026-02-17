import { verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import { getUserByClerkId, getSupabaseClient } from "@/lib/user-sync";
import { convertIdsToLabels } from "@/lib/interdictions";
import { cors, corsOptions, errorResponse, safeError } from "@/lib/api-helpers";
import { checkRateLimit, listingLimiter } from "@/lib/rate-limit";
import { TIERS_CONFIG, BOOST_DURATION_DAYS } from "@/lib/constants";
import { captureServerEvent } from "@/lib/posthog-server";
import { listingSchema } from "@/lib/validations";
import validator from "validator";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Helper to sanitize string inputs
const sanitizeString = (str: string) => {
  if (typeof str !== "string") return str;
  return validator.escape(validator.trim(str));
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
    const { success: rateLimitOk, headers: rateLimitHeaders } = await checkRateLimit(
      listingLimiter,
      clerkUserId
    );

    if (!rateLimitOk) {
      const response = errorResponse("Too many listing requests. Please try again later.", 429, req);
      rateLimitHeaders.forEach((value, key) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // 3. Get user from Supabase
    console.log("Fetching Supabase user for Clerk ID:", clerkUserId);
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      console.error("User not found in Supabase");
      return errorResponse(
        "User not found. Please ensure Clerk webhooks are set up to sync users to Supabase.",
        404,
        req
      );
    }
    console.log("Supabase user found:", user.id);

    // 4. Check if user is an owner, agent, staff, or founder
    const isStaffOrFounder = user.user_type === "staff" || user.user_type === "founder";
    const canCreateListing = ["owner", "agent", "staff", "founder"].includes(user.user_type);

    if (!canCreateListing) {
      console.error("User unauthorized to create listing:", user.user_type);
      return errorResponse("Only owners, agents, staff, or founders can create listings", 403, req);
    }

    // 5. Parse and validate request body
    console.log("Parsing request body...");
    const body = await req.json();
    const { listingData } = body;

    if (!listingData) {
      console.error("Missing listingData");
      return errorResponse("Missing listingData in request body", 400, req);
    }

    // 5b. Zod validation (server-side)
    // Note: We skip photos validation on server as they are uploaded separately
    const validationResult = listingSchema.omit({ photos: true }).safeParse(listingData);
    if (!validationResult.success) {
      console.error("Validation failed:", validationResult.error.format());
      return errorResponse("Données invalides: " + validationResult.error.issues[0].message, 400, req);
    }

    // 6. Get Supabase client (service role - bypasses RLS)
    const supabase = getSupabaseClient();

    // 7. Map interdiction IDs to labels (plain text)
    const interdictionsLabels = convertIdsToLabels(listingData.interdictions);

    // 8. Use TIERS_CONFIG from constants
    
    // Check if staff is paying (has payment_id)
    const isStaffPaying = isStaffOrFounder && listingData.payment_id;
    const isFreeStaffListing = isStaffOrFounder && !listingData.payment_id;

    const selectedTier = listingData.tier_id
      ? TIERS_CONFIG[listingData.tier_id as keyof typeof TIERS_CONFIG]
      : null;
    
    const tierPrice = isFreeStaffListing 
      ? 0 
      : selectedTier
        ? selectedTier.base_fee + listingData.prixMensuel * 0.05
        : null;

    const isBoosted = listingData.add_ons?.includes("boost") || false;
    let boostExpiresAt = null;
    if (isBoosted) {
      const date = new Date();
      date.setDate(date.getDate() + BOOST_DURATION_DAYS);
      boostExpiresAt = date.toISOString();
    }

    // Calculate slot limit with add-ons
    let slotLimit = selectedTier?.slot_limit || (isFreeStaffListing ? 100 : null);
    if (slotLimit !== null && listingData.add_ons?.includes("extra_slots")) {
      slotLimit += 25;
    }

    // Calculate photo limit with add-ons
    let photoLimit = selectedTier?.photo_limit || (isFreeStaffListing ? 20 : null);
    if (photoLimit !== null && listingData.add_ons?.includes("extra_photos")) {
      photoLimit += 5;
    }

    // Calculate open house limit with add-ons
    let openHouseLimit = selectedTier?.open_house_limit || (isFreeStaffListing ? 5 : null);
    if (openHouseLimit !== null && listingData.add_ons?.includes("open_house")) {
      openHouseLimit += 1;
    }

    // Staff listings are automatically verified (en_ligne), owner/agent listings need approval
    const propertyStatus = isStaffOrFounder ? "en_ligne" : "en_attente";

    // Generate staff transaction ID if needed
    const staffDepositId = isFreeStaffListing
      ? `STAFF-FREE-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      : null;

    const propertyData = {
      agent_id: listingData.owner_id || user.id,
      title: sanitizeString(listingData.titre),
      description: sanitizeString(listingData.description) || null,
      price: listingData.prixMensuel,
      listing_type: "louer" as const,
      property_type: listingData.type,
      status: propertyStatus as "en_attente" | "en_ligne",
      bedrooms: listingData.chambres || null,
      bathrooms: listingData.sdb || null,
      area: listingData.superficie || null,
      parking_spaces: listingData.vehicules || null,
      address: `${sanitizeString(listingData.quartier)}, ${sanitizeString(listingData.ville)}`,
      city: listingData.ville,
      quartier: sanitizeString(listingData.quartier),
      latitude: listingData.latitude || null,
      longitude: listingData.longitude || null,
      caution_mois: listingData.cautionMois || null,
      interdictions: interdictionsLabels,
      period: "month",
      // Tier information
      tier_id: listingData.tier_id || null,
      tier_price: tierPrice,
      slot_limit: slotLimit,
      open_house_limit: openHouseLimit,
      photo_limit: photoLimit,
      video_included: selectedTier?.video_included || listingData.add_ons?.includes("video") || isFreeStaffListing,
      has_premium_badge: isStaffPaying ? (selectedTier?.has_badge || false) : (isFreeStaffListing ? true : (selectedTier?.has_badge || false)),
      payment_id: listingData.payment_id || staffDepositId,
      // Boost information
      is_boosted: isBoosted,
      boost_expires_at: boostExpiresAt,
      // Set published_at for staff listings since they go live immediately
      published_at: isStaffOrFounder ? new Date().toISOString() : null,
    };

    // 9. Insert property
    console.log("Inserting property into database...", isStaffOrFounder ? "(Staff listing - auto-verified)" : "");
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .insert(propertyData)
      .select()
      .single();

    if (propertyError || !property) {
      console.error("Error creating property:", JSON.stringify(propertyError, null, 2));
      return errorResponse(
        safeError(propertyError, "Failed to create property"),
        500,
        req
      );
    }

    const propertyId = property.id;
    console.log("Property created successfully:", propertyId, isStaffOrFounder ? "(Verified)" : "(Pending)");

    // 10. Create transaction record
    if (isFreeStaffListing && staffDepositId) {
      console.log("Creating staff listing transaction record...");
      const staffTransaction = {
        deposit_id: staffDepositId,
        amount: 0,
        currency: "XOF",
        status: "completed" as const,
        type: "staff_listing" as const,
        provider: "STAFF_INTERNAL",
        user_id: user.id,
        property_id: propertyId,
        metadata: {
          staff_id: user.id,
          staff_name: user.full_name || user.email,
          owner_id: listingData.owner_id || null,
          reason: "Founding owner - free listing promotion",
          created_by: "staff_portal",
        },
      };

      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .insert(staffTransaction)
        .select()
        .single();

      if (txError) {
        console.error("Error creating staff transaction:", txError);
      } else if (txData) {
        console.log("Staff transaction created:", txData.id);
        await supabase
          .from("properties")
          .update({ transaction_id: txData.id })
          .eq("id", propertyId);
      }
    } else if (listingData.payment_id) {
      console.log("Linking transaction to property:", listingData.payment_id);
      const { data: updatedTransaction, error: txError } = await supabase
        .from("transactions")
        .update({
          property_id: propertyId,
          updated_at: new Date().toISOString(),
        })
        .eq("deposit_id", listingData.payment_id)
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
      }
    }

    // 11. Link amenities
    if (
      listingData.equipements &&
      Array.isArray(listingData.equipements) &&
      listingData.equipements.length > 0
    ) {
      console.log("Linking amenities:", listingData.equipements);
      const { data: amenities, error: amenitiesError } = await supabase
        .from("amenities")
        .select("id, name")
        .in("name", listingData.equipements);

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
      property_type: listingData.type || null,
      price: listingData.prixMensuel || 0,
      city: listingData.ville || null,
      quartier: listingData.quartier || null,
      tier_id: listingData.tier_id || null,
      status: propertyStatus,
      creator_type: user.user_type,
      is_boosted: isBoosted,
      photo_limit: photoLimit || 0,
      slot_limit: slotLimit || 0,
      open_house_limit: openHouseLimit || 0,
    });

    // 12. Return success response
    return cors(
      NextResponse.json({
        success: true,
        propertyId,
        isVerified: isStaffOrFounder,
        transactionId: isStaffOrFounder ? staffDepositId : listingData.payment_id,
      }),
      req
    );
  } catch (error) {
    console.error("Error in POST /api/properties:", error);
    return errorResponse(safeError(error, "An unexpected error occurred"), 500, req);
  }
}
