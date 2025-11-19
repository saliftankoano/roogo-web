import { verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import { getUserByClerkId, getSupabaseClient } from "@/lib/user-sync";

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
  try {
    // 1. Verify Clerk token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      return cors(json({ error: "Missing token" }, 401));
    }

    let clerkUserId: string | undefined;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub as string | undefined;
    } catch (error) {
      console.error("Token verification failed:", error);
      return cors(json({ error: "Invalid token" }, 401));
    }

    if (!clerkUserId) {
      return cors(json({ error: "Unauthorized" }, 401));
    }

    // 2. Get user from Supabase
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
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

    // 3. Check if user is an owner
    if (user.user_type !== "owner") {
      return cors(
        json({ error: "Only property owners can create listings" }, 403)
      );
    }

    // 4. Parse and validate request body
    const body = await req.json();
    const { listingData } = body;

    if (!listingData) {
      return cors(json({ error: "Missing listingData in request body" }, 400));
    }

    // 5. Get Supabase client (service role - bypasses RLS)
    const supabase = getSupabaseClient();

    // 6. Map form data to database schema
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
      interdictions: listingData.interdictions || null,
      period: "month",
    };

    // 7. Insert property
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

    // 8. Create image records if photos are provided
    if (listingData.photos && Array.isArray(listingData.photos)) {
      const imageRecords = listingData.photos
        .filter((photo: { url: string }) => photo.url) // Only include photos with URLs
        .map(
          (
            photo: { url: string; width: number; height: number },
            index: number
          ) => ({
            property_id: propertyId,
            url: photo.url,
            width: photo.width || 1024,
            height: photo.height || 768,
            is_primary: index === 0,
          })
        );

      if (imageRecords.length > 0) {
        const { error: imagesError } = await supabase
          .from("property_images")
          .insert(imageRecords);

        if (imagesError) {
          console.error("Error creating image records:", imagesError);
          // Don't fail the whole submission if images fail
        }
      }
    }

    // 9. Link amenities
    if (
      listingData.equipements &&
      Array.isArray(listingData.equipements) &&
      listingData.equipements.length > 0
    ) {
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
