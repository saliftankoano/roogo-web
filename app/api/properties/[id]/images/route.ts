import { cors, corsOptions } from "@/lib/api-helpers";
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";
import { getAuthenticatedUser, isStaffOrFounder } from "@/lib/api-auth";

/**
 * @description Handle OPTIONS request for CORS
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req);
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

    // 1. Verify user
    const user = await getAuthenticatedUser(req);
    if (!user) {
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

    if (!isStaffOrFounder(user) && property.agent_id !== user.id) {
      return cors(json({ error: "Forbidden" }, 403));
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

    // 1. Verify user
    const user = await getAuthenticatedUser(req);
    if (!user) {
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

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, agent_id")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      return cors(json({ error: "Property not found" }, 404));
    }

    if (!isStaffOrFounder(user) && property.agent_id !== user.id) {
      return cors(json({ error: "Forbidden" }, 403));
    }

    // 4. Delete from database
    const { error: dbError } = await supabase.rpc("delete_property_image", {
      p_property_id: propertyId, p_url: url,
    });

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

    // 1. Verify user
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return cors(json({ error: "Unauthorized" }, 401));
    }

    // 2. Parse request body
    const body = await req.json();
    const { url, urls, expectedUrls } = body;
    const isReorder = urls !== undefined;
    const validUrls = (value: unknown): value is string[] =>
      Array.isArray(value) && value.length > 0 && value.length <= 20 &&
      value.every((entry) => typeof entry === "string" && entry.trim().length > 0) &&
      new Set(value).size === value.length;
    if (isReorder && (!validUrls(urls) || !validUrls(expectedUrls))) {
      return cors(json({ error: "Invalid photo order", code: "INVALID_PHOTO_ORDER" }, 400));
    }
    if (!isReorder && (typeof url !== "string" || !url.trim())) {
      return cors(json({ error: "Missing image url" }, 400));
    }

    // 3. Get Supabase client (service role)
    const supabase = getSupabaseClient();

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, agent_id")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      return cors(json({ error: "Property not found" }, 404));
    }

    if (!isStaffOrFounder(user) && property.agent_id !== user.id) {
      return cors(json({ error: "Forbidden" }, 403));
    }

    // Selection and reset must commit together. primary_image is a read-view
    // projection, never a column to write on properties.
    const { data: primaryImage, error: primaryError } = isReorder
      ? await supabase.rpc("reorder_property_images", {
          p_property_id: propertyId, p_urls: urls, p_expected_urls: expectedUrls,
        })
      : await supabase.rpc("set_property_primary_image", {
          p_property_id: propertyId, p_url: url,
        });

    if (primaryError) {
      if (primaryError.code === "40001" || primaryError.code === "22023") {
        return cors(json({ error: "Gallery changed; reload before rearranging", code: "PHOTO_ORDER_CONFLICT" }, 409));
      }
      if (primaryError.code === "P0002") {
        return cors(json({ error: "Image not found", code: "IMAGE_NOT_FOUND" }, 404));
      }
      console.error("Error setting primary image:", primaryError);
      return cors(json({ error: "Failed to set primary image", code: "PRIMARY_IMAGE_SAVE_FAILED" }, 500));
    }

    return cors(json(isReorder
      ? { success: true, photos: primaryImage, primaryImageUrl: primaryImage?.[0] }
      : { success: true, primaryImageUrl: primaryImage }));

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
