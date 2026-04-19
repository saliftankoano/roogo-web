import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

const EVIDENCE_BUCKET = "deposit-evidence";
const MAX_PHOTOS_PER_CLAIM = 6;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: holdId } = await params;
    if (!holdId) return errorResponse("Missing hold id", 400, req);

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const body = (await req.json()) as { count?: unknown };
    const count = Math.max(1, Math.min(MAX_PHOTOS_PER_CLAIM, Number(body.count) || 1));

    const { data: hold, error: holdError } = await supabaseAdmin
      .from("deposit_holds")
      .select("id, owner_id, status")
      .eq("id", holdId)
      .maybeSingle();

    if (holdError) {
      console.error("Error loading hold for evidence upload:", holdError);
      return errorResponse("Failed to load deposit hold", 500, req);
    }
    if (!hold) return errorResponse("Deposit hold not found", 404, req);
    if (hold.owner_id !== user.id) return errorResponse("Forbidden", 403, req);
    if (hold.status !== "held") {
      return errorResponse(
        "Evidence can only be attached while the hold is active",
        409,
        req,
      );
    }

    const uploads: { path: string; signedUrl: string; token: string }[] = [];
    for (let i = 0; i < count; i++) {
      const path = `${holdId}/${crypto.randomUUID()}.jpg`;
      const { data, error } = await supabaseAdmin.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUploadUrl(path);

      if (error || !data) {
        console.error("Error creating signed upload URL:", error);
        return errorResponse("Failed to create upload URL", 500, req);
      }

      uploads.push({
        path: data.path,
        signedUrl: data.signedUrl,
        token: data.token,
      });
    }

    return cors(NextResponse.json({ success: true, uploads }), req);
  } catch (error) {
    console.error("Error in POST /api/deposit-holds/[id]/evidence/upload-url:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
