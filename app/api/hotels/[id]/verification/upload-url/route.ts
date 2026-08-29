import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { HOTEL_BUSINESS_DOCUMENTS_BUCKET } from "@/lib/hotel-business-verification";
import { getHotelMembership } from "@/lib/hotel-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
    const membership = await getHotelMembership(user.id, id);
    if (membership?.role !== "admin") return errorResponse("Forbidden", 403, req);

    const body = await req.json().catch(() => ({}));
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
    const allowed = new Map([
      ["image/jpeg", "jpg"],
      ["image/png", "png"],
      ["image/webp", "webp"],
      ["application/pdf", "pdf"],
    ]);
    const extension = allowed.get(mimeType);
    if (!extension) return errorResponse("Unsupported document type", 400, req);

    const path = `${id}/${crypto.randomUUID()}/rccm.${extension}`;
    const { data, error } = await supabaseAdmin.storage
      .from(HOTEL_BUSINESS_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) throw error || new Error("Upload URL unavailable");
    return cors(
      NextResponse.json({
        success: true,
        upload: { path: data.path, signedUrl: data.signedUrl, token: data.token },
      }),
      req,
    );
  } catch (error) {
    console.error("Hotel RCCM upload URL:", error);
    return errorResponse("Failed to create upload URL", 500, req);
  }
}
