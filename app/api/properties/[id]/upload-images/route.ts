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
 * @description Handle POST request to upload images for a property
 * @param req - Request object
 * @param params - Route params containing property id
 * @returns Response with uploaded image URLs or error
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

    // 2. Parse JSON body with base64 images
    const body = await req.json();
    const { images } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return cors(json({ error: "No images provided" }, 400));
    }

    // 3. Get Supabase client (service role - bypasses RLS)
    const supabase = getSupabaseClient();

    // 4. Verify the property exists
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      console.error("Property not found:", propertyError);
      return cors(
        json({ error: "Property not found or you don't have permission" }, 404)
      );
    }

    // 5. Upload images to Supabase Storage
    const uploadedImages: Array<{
      url: string;
      width: number;
      height: number;
    }> = [];

    for (let index = 0; index < images.length; index++) {
      const imageData = images[index];
      const { data: base64Data, width, height, ext } = imageData;

      if (!base64Data) {
        console.error(`Image ${index} missing base64 data`);
        continue;
      }

      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, "base64");
      const fileName = `${propertyId}/${index}.${ext || "jpg"}`;

      // Determine content type
      const contentType =
        ext === "png"
          ? "image/png"
          : ext === "heic"
          ? "image/heic"
          : "image/jpeg";

      console.log(`Uploading image ${index + 1}/${images.length}: ${fileName}`);

      // Upload to Supabase Storage using service role
      const { error: uploadError } = await supabase.storage
        .from("listing")
        .upload(fileName, buffer, {
          contentType,
          upsert: false,
        });

      if (uploadError) {
        console.error(`Error uploading image ${index}:`, uploadError);
        continue; // Skip failed uploads
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("listing").getPublicUrl(fileName);

      uploadedImages.push({
        url: publicUrl,
        width: width || 1024,
        height: height || 768,
      });
    }

    if (uploadedImages.length === 0) {
      return cors(json({ error: "Failed to upload any images" }, 500));
    }

    // 6. Create image records in database
    const imageRecords = uploadedImages.map((img, index) => ({
      property_id: propertyId,
      url: img.url,
      width: img.width,
      height: img.height,
      is_primary: index === 0,
    }));

    const { error: imagesError } = await supabase
      .from("property_images")
      .insert(imageRecords);

    if (imagesError) {
      console.error("Error creating image records:", imagesError);
      // Still return success with URLs even if DB insert fails
    }

    // 7. Return success
    return cors(
      json({
        success: true,
        images: uploadedImages,
        imagesLinked: imageRecords.length,
      })
    );
  } catch (error) {
    console.error("Error in POST /api/properties/[id]/upload-images:", error);
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
