import { cors, corsOptions } from "@/lib/api-helpers";
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";
import { getAuthenticatedUser, isStaffOrFounder } from "@/lib/api-auth";
import { MAX_LISTING_PHOTOS } from "@/lib/validations";
import {
  createContentAddressedListingImagePath,
  PUBLIC_LISTING_IMAGE_CACHE_CONTROL,
} from "@/lib/public-listing-images";

// Increase timeout for image uploads
export const maxDuration = 60; // 60 seconds
export const runtime = "nodejs";

/**
 * @description Handle OPTIONS request for CORS
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * @description Handle POST request to upload a single image for a property
 * @param req - Request object
 * @param params - Route params containing property id
 * @returns Response with uploaded image URL or error
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: propertyId } = await params;

    // 1. Verify user
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return cors(json({ error: "Unauthorized" }, 401));
    }

    // 2. Parse JSON body with single base64 image
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      return cors(json({ error: "Invalid request body" }, 400));
    }

    const { data: base64Data, width, height, ext, index } = body;

    if (!base64Data) {
      return cors(json({ error: "No image data provided" }, 400));
    }

    // 3. Get Supabase client (service role - bypasses RLS)
    const supabase = getSupabaseClient();

    // 4. Verify the property exists
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, agent_id")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      console.error("Property not found:", propertyError);
      return cors(
        json({ error: "Property not found or you don't have permission" }, 404),
      );
    }

    if (!isStaffOrFounder(user) && property.agent_id !== user.id) {
      return cors(json({ error: "Forbidden" }, 403));
    }

    const buffer = Buffer.from(base64Data, "base64");
    const fileName = createContentAddressedListingImagePath(
      propertyId,
      ext || "jpg",
      buffer,
    );
    const {
      data: { publicUrl },
    } = supabase.storage.from("listing").getPublicUrl(fileName);
    const findLinkedImage = () =>
      supabase
        .from("property_images")
        .select("url, width, height")
        .eq("property_id", propertyId)
        .eq("url", publicUrl)
        .maybeSingle();

    // Check before the limit: replaying the last allowed photo must still succeed.
    const { data: existingImage, error: existingImageError } =
      await findLinkedImage();
    if (existingImageError) {
      return cors(json({ error: "Unable to verify existing photo" }, 500));
    }
    if (existingImage) {
      return cors(json({ success: true, ...existingImage }));
    }

    const { count: existingImageCount, error: imageCountError } = await supabase
      .from("property_images")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId);

    if (imageCountError) {
      console.error("Error counting property images:", imageCountError);
      return cors(json({ error: "Unable to verify photo limit" }, 500));
    }

    if ((existingImageCount || 0) >= MAX_LISTING_PHOTOS) {
      return cors(
        json(
          {
            error: `A property can have up to ${MAX_LISTING_PHOTOS} photos.`,
            maxPhotos: MAX_LISTING_PHOTOS,
            existingPhotos: existingImageCount || 0,
          },
          400,
        ),
      );
    }

    const { count: primaryCount, error: primaryError } = await supabase
      .from("property_images")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("is_primary", true);
    if (primaryError) {
      return cors(json({ error: "Unable to verify primary photo" }, 500));
    }

    // Determine content type
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "heic"
          ? "image/heic"
          : "image/jpeg";

    console.log(`Uploading image: ${fileName} (${buffer.length} bytes)`);

    // Prepare image record for database (used in both success and conflict-recovery paths)
    const imageRecord = {
      property_id: propertyId,
      url: publicUrl,
      width: width || 1024,
      height: height || 768,
      is_primary: index === 0 && (primaryCount || 0) === 0,
    };

    // 6. Upload to Supabase Storage using service role
    const { error: uploadError } = await supabase.storage
      .from("listing")
      .upload(fileName, buffer, {
        contentType,
        cacheControl: PUBLIC_LISTING_IMAGE_CACHE_CONTROL,
        upsert: false,
      });

    if (uploadError) {
      // Another request may have finished while this one was uploading. Storage
      // rejects the shared content key, so only its creator inserts a DB row.
      const { data: linkedImage, error: linkedImageError } =
        await findLinkedImage();
      if (!linkedImageError && linkedImage) {
        return cors(json({ success: true, ...linkedImage }));
      }

      console.error("Error uploading image:", uploadError);
      return cors(
        json({ error: `Failed to upload image: ${uploadError.message}` }, 500),
      );
    }

    // 8. Create image record in database

    const { error: imagesError } = await supabase
      .from("property_images")
      .insert(imageRecord);

    if (imagesError) {
      console.error("Error creating image record:", imagesError);
      // A lost DB response can report an error after the row was committed.
      const { data: linkedImage, error: lookupError } = await findLinkedImage();
      if (!lookupError && linkedImage) {
        return cors(json({ success: true, ...linkedImage }));
      }
      // This request owns the new object. Release its key so a retry can upload
      // again, but only after confirming no DB row references it.
      if (!lookupError) {
        const { error: cleanupError } = await supabase.storage
          .from("listing")
          .remove([fileName]);
        if (cleanupError)
          console.error("Error cleaning up unlinked photo:", cleanupError);
      }
      return cors(json({ error: "Failed to link photo. Please retry." }, 500));
    }

    // 9. Return success
    return cors(
      json({
        success: true,
        url: publicUrl,
        width: imageRecord.width,
        height: imageRecord.height,
      }),
    );
  } catch (error) {
    console.error("Error in POST /api/properties/[id]/upload-image:", error);
    return cors(
      json(
        {
          error:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
        },
        500,
      ),
    );
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}
