import { verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import { getUserByClerkId, getSupabaseClient } from "@/lib/user-sync";
import { convertIdsToLabels } from "@/lib/interdictions";

/**
 * @description Handle OPTIONS request for CORS
 */
export async function OPTIONS() {
  return cors(NextResponse.json({ ok: true }));
}

/**
 * @description Handle POST request to create a property listing
 * @param req - Request object
 * @returns Response with property ID or error
 */
export async function POST(req: Request) {
  console.log("Received POST request to /api/properties");
  try {
    // 1. Verify Clerk token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      console.error("Missing authorization token");
      return cors(json({ error: "Missing token" }, 401));
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
      return cors(json({ error: "Invalid token" }, 401));
    }

    if (!clerkUserId) {
      return cors(json({ error: "Unauthorized" }, 401));
    }

    // 2. Get user from Supabase
    console.log("Fetching Supabase user for Clerk ID:", clerkUserId);
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      console.error("User not found in Supabase");
      return cors(
        json(
          {
            error:
              "User not found. Please ensure Clerk webhooks are set up to sync users to Supabase.",
          },
          404
        )
      );
    }
    console.log("Supabase user found:", user.id);

    // 3. Check if user is an owner
    if (user.user_type !== "owner") {
      console.error("User is not an owner:", user.user_type);
      return cors(
        json({ error: "Only property owners can create listings" }, 403)
      );
    }

    // 4. Parse and validate request body
    console.log("Parsing request body...");
    const body = await req.json();
    const { listingData } = body;

    if (!listingData) {
      console.error("Missing listingData");
      return cors(json({ error: "Missing listingData in request body" }, 400));
    }

    // 5. Get Supabase client (service role - bypasses RLS)
    const supabase = getSupabaseClient();

    // 6. Map interdiction IDs to labels (plain text)
    const interdictionsLabels = convertIdsToLabels(listingData.interdictions);

    // 7. Map form data to database schema
    const propertyData = {
      agent_id: user.id,
      title: listingData.titre,
      description: listingData.description || null,
      price: listingData.prixMensuel,
      listing_type: "louer" as const,
      property_type: listingData.type,
      status: "en_attente" as const,
      bedrooms: listingData.chambres || null,
      bathrooms: listingData.sdb || null,
      area: listingData.superficie || null,
      parking_spaces: listingData.vehicules || null,
      address: `${listingData.quartier}, ${listingData.ville}`,
      city: listingData.ville,
      quartier: listingData.quartier,
      caution_mois: listingData.cautionMois || null,
      interdictions: interdictionsLabels,
      period: "month",
    };

    // 8. Insert property
    console.log("Inserting property into database...");
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .insert(propertyData)
      .select()
      .single();

    if (propertyError || !property) {
      console.error("Error creating property:", propertyError);
      return cors(
        json(
          {
            error: propertyError?.message || "Failed to create property",
          },
          500
        )
      );
    }

    const propertyId = property.id;
    console.log("Property created successfully:", propertyId);

    // 8. Create image records if photos are provided (skipping for now as per new flow)
    // ... (rest of logic remains same, but usually empty array in new flow)

    // 9. Link amenities
    if (
      listingData.equipements &&
      Array.isArray(listingData.equipements) &&
      listingData.equipements.length > 0
    ) {
      console.log("Linking amenities:", listingData.equipements);
      // Get amenity IDs by name
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
          // Don't fail the whole submission if amenities fail
        }
      }
    }

    // 10. Return success response
    return cors(
      json({
        success: true,
        propertyId,
      })
    );
  } catch (error) {
    console.error("Error in POST /api/properties:", error);
    return cors(
      json(
        {
          error:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
        },
        500
      )
    );
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function cors(res: NextResponse) {
  res.headers.set(
    "Access-Control-Allow-Origin",
    process.env.CORS_ORIGIN || "*"
  );
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}
