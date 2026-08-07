import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "rental-agreement-imports";
const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const body = await req.json().catch(() => null);
  const propertyId = body?.property_id;
  const mimeTypes = Array.isArray(body?.mime_types) ? body.mime_types : [];
  if (!propertyId || mimeTypes.length < 1 || mimeTypes.length > 10) {
    return errorResponse("Invalid upload request", 400, req);
  }
  if (mimeTypes.some((mime: unknown) => typeof mime !== "string" || !EXTENSIONS[mime])) {
    return errorResponse("Unsupported document type", 400, req);
  }

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property) return errorResponse("Property not found", 404, req);

  const uploads = await Promise.all(
    mimeTypes.map(async (mimeType: string) => {
      const path = `${staff.id}/${propertyId}/${randomUUID()}.${EXTENSIONS[mimeType]}`;
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error("Could not create upload URL");
      return { path, token: data.token, signed_url: data.signedUrl, mime_type: mimeType };
    }),
  );

  return cors(NextResponse.json({ uploads }), req);
}
