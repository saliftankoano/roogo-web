import { cors, corsOptions } from "@/lib/api-helpers";
import { getAuthenticatedUser, isStaffOrFounder } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";
import { getSupabaseClient } from "@/lib/user-sync";
import { NextResponse } from "next/server";

export const maxDuration = 120;
export const runtime = "nodejs";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v"]);

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: propertyId } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return cors(json({ error: "Unauthorized" }, 401));

    const body = await req.json();
    const { data, ext, mimeType, sizeBytes, durationSeconds } = body;
    if (typeof data !== "string" || data.length === 0) {
      return cors(json({ error: "No video provided" }, 400));
    }

    const normalizedExt = String(ext || "mp4").toLowerCase().replace(".", "");
    if (!VIDEO_EXTENSIONS.has(normalizedExt)) {
      return cors(json({ error: "Unsupported video format" }, 400));
    }

    const buffer = Buffer.from(data, "base64");
    if (buffer.byteLength > MAX_VIDEO_BYTES) {
      return cors(json({ error: "Video exceeds 100 MB" }, 400));
    }

    const supabase = getSupabaseClient();
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, agent_id, video_included")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      return cors(json({ error: "Property not found" }, 404));
    }
    if (!isStaffOrFounder(user) && property.agent_id !== user.id) {
      return cors(json({ error: "Forbidden" }, 403));
    }
    if (!property.video_included) {
      return cors(json({ error: "Video is not included for this listing" }, 403));
    }

    const { count, error: countError } = await supabase
      .from("property_videos")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId);
    if (countError) {
      return cors(json({ error: "Unable to verify video limit" }, 500));
    }
    if ((count || 0) >= 1) {
      return cors(json({ error: "A property can have one video" }, 400));
    }

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${propertyId}/videos/${uniqueSuffix}.${normalizedExt}`;
    const contentType =
      typeof mimeType === "string" && mimeType.startsWith("video/")
        ? mimeType
        : `video/${normalizedExt === "mov" ? "quicktime" : normalizedExt}`;

    const { error: uploadError } = await supabase.storage
      .from("listing")
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading property video:", uploadError);
      return cors(json({ error: "Failed to upload video" }, 500));
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("listing").getPublicUrl(storagePath);

    const { error: insertError } = await supabase.from("property_videos").insert({
      property_id: propertyId,
      url: publicUrl,
      storage_path: storagePath,
      mime_type: contentType,
      size_bytes:
        typeof sizeBytes === "number" && Number.isFinite(sizeBytes)
          ? sizeBytes
          : buffer.byteLength,
      duration_seconds:
        typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
          ? durationSeconds
          : null,
    });

    if (insertError) {
      console.error("Error creating property video record:", insertError);
      await supabase.storage.from("listing").remove([storagePath]);
      return cors(json({ error: "Failed to link video to property" }, 500));
    }

    await captureServerEvent(user.clerk_id || user.id, "property_video_uploaded", {
      property_id: propertyId,
      mime_type: contentType,
      size_bytes: buffer.byteLength,
    });

    return cors(
      json({
        success: true,
        video: {
          url: publicUrl,
          mimeType: contentType,
          sizeBytes: buffer.byteLength,
        },
      }),
    );
  } catch (error) {
    console.error("Error in POST /api/properties/[id]/upload-video:", error);
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
