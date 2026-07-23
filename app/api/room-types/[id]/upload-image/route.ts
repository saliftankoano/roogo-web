import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getHotelMembershipForProperty } from "@/lib/hotel-auth";

export const maxDuration = 60;
export const runtime = "nodejs";

const MAX_ROOM_TYPE_PHOTOS = 10;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const { data: roomType, error: roomTypeError } = await supabaseAdmin
      .from("room_types")
      .select("id, property_id, photos")
      .eq("id", id)
      .maybeSingle();
    if (roomTypeError) throw roomTypeError;
    if (!roomType) return errorResponse("Room type not found", 404, req);

    const membership = await getHotelMembershipForProperty(
      user.id,
      roomType.property_id,
    );
    if (membership?.role !== "admin") {
      return errorResponse("Forbidden", 403, req);
    }

    const body = await req.json().catch(() => null);
    const base64Data = body?.data;
    if (!base64Data || typeof base64Data !== "string") {
      return errorResponse("No image data provided", 400, req);
    }

    const photos: string[] = Array.isArray(roomType.photos)
      ? roomType.photos
      : [];
    if (photos.length >= MAX_ROOM_TYPE_PHOTOS) {
      return errorResponse(
        `A room type can have up to ${MAX_ROOM_TYPE_PHOTOS} photos.`,
        400,
        req,
      );
    }

    const buffer = Buffer.from(base64Data, "base64");
    const ext = body?.ext === "png" ? "png" : "jpg";
    const fileName = `room-types/${id}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("listing")
      .upload(fileName, buffer, {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
        upsert: false,
      });
    if (uploadError) {
      console.error("Error uploading room type image:", uploadError);
      return errorResponse("Failed to upload image", 500, req);
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("listing").getPublicUrl(fileName);

    const { error: updateError } = await supabaseAdmin
      .from("room_types")
      .update({
        photos: [...photos, publicUrl],
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateError) throw updateError;

    return cors(NextResponse.json({ success: true, url: publicUrl }), req);
  } catch (error) {
    console.error("Error in POST /api/room-types/[id]/upload-image:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
