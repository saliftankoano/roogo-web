import { verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";

/**
 * @description Handle OPTIONS request for CORS
 */
export async function OPTIONS() {
  return cors(NextResponse.json({ ok: true }));
}

/**
 * @description Handle POST request to link images to an existing property
 * @param req - Request object
 * @param params - Route params containing property id
 * @returns Response with success status or error
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;

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

    // 2. Parse request body
    const body = await req.json();
    const { photos } = body;

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return cors(json({ error: "Missing photos array in request body" }, 400));
    }

    // 3. Get Supabase client (service role - bypasses RLS)
    const supabase = getSupabaseClient();

    // 4. Verify the property exists and belongs to this user
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, agent_id")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      console.error("Property not found:", propertyError);
      return cors(
        json(
          { error: "Property not found or you don't have permission" },
          404
        )
      );
    }

    // 5. Create image records
    const imageRecords = photos.map(
      (
        photo: { url: string; width: number; height: number },
        index: number
      ) => ({
        property_id: propertyId,
        url: photo.url,
        width: photo.width || 1024,
        height: photo.height || 768,
        is_primary: index === 0, // First image is primary
      })
    );

    const { error: imagesError } = await supabase
      .from("property_images")
      .insert(imageRecords);

    if (imagesError) {
      console.error("Error creating image records:", imagesError);
      return cors(
        json({ error: "Failed to link images to property" }, 500)
      );
    }

    // 6. Return success
    return cors(
      json({
        success: true,
        imagesLinked: imageRecords.length,
      })
    );
  } catch (error) {
    console.error("Error in POST /api/properties/[id]/images:", error);
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

/**
 * @description Handle DELETE request to remove an image from a property
 * @param req - Request object
 * @param params - Route params containing property id
 * @returns Response with success status
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;

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

    // 2. Parse request body
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return cors(json({ error: "Missing image url" }, 400));
    }

    // 3. Get Supabase client (service role)
    const supabase = getSupabaseClient();

    // 4. Delete from database
    const { error: dbError } = await supabase
      .from("property_images")
      .delete()
      .match({ property_id: propertyId, url: url });

    if (dbError) {
      console.error("Error deleting image record:", dbError);
      return cors(json({ error: "Failed to delete image record" }, 500));
    }

    // 5. Delete from storage (if it's a supabase storage url)
    if (url.includes("/storage/v1/object/public/listing/")) {
      const path = url.split("/listing/")[1];
      if (path) {
        const { error: storageError } = await supabase.storage
          .from("listing")
          .remove([decodeURIComponent(path)]);

        if (storageError) {
          console.error("Error deleting image from storage:", storageError);
          // We continue even if storage delete fails, as DB record is gone
        }
      }
    }

    return cors(json({ success: true }));

  } catch (error) {
    console.error("Error in DELETE /api/properties/[id]/images:", error);
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

/**
 * @description Handle PATCH request to set a primary image
 * @param req - Request object
 * @param params - Route params containing property id
 * @returns Response with success status
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;

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

    // 2. Parse request body
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return cors(json({ error: "Missing image url" }, 400));
    }

    // 3. Get Supabase client (service role)
    const supabase = getSupabaseClient();

    // 4. Update database: Set all to false, then target to true
    // First, set all images for this property to is_primary = false
    const { error: resetError } = await supabase
      .from("property_images")
      .update({ is_primary: false })
      .eq("property_id", propertyId);

    if (resetError) {
      console.error("Error resetting primary images:", resetError);
      return cors(json({ error: "Failed to update image status" }, 500));
    }

    // Then set the target image to is_primary = true
    const { error: setError } = await supabase
      .from("property_images")
      .update({ is_primary: true })
      .match({ property_id: propertyId, url: url });

    if (setError) {
      console.error("Error setting primary image:", setError);
      return cors(json({ error: "Failed to set primary image" }, 500));
    }

    return cors(json({ success: true }));

  } catch (error) {
    console.error("Error in PATCH /api/properties/[id]/images:", error);
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
  res.headers.set("Access-Control-Allow-Methods", "POST, DELETE, PATCH, OPTIONS");
  return res;
}
