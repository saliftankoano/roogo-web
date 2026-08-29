import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse, safeError } from "@/lib/api-helpers";
import {
  ADVERTISER_PROOF_BUCKET,
  advertiserProofKindSchema,
  canAccessAdvertisingOnboarding,
} from "@/lib/advertising";
import { resolveClerkId } from "@/lib/request-auth";
import {
  advertisingProofUploadLimiter,
  checkRateLimit,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { z } from "zod";

const uploadRequestSchema = z.object({
  kind: advertiserProofKindSchema,
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]),
});

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

function safeExtension(fileName: string, mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext === "jpeg" ? "jpeg" : "jpg";
}

export async function POST(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!canAccessAdvertisingOnboarding(user.user_type)) {
      return errorResponse("Advertising onboarding is not enabled", 403, req);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("advertiser_profiles")
      .select("id, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return errorResponse(
        "Save your advertiser profile before uploading proof",
        409,
        req,
      );
    }
    if (!["draft", "changes_requested", "rejected"].includes(profile.status)) {
      return errorResponse("Business proof cannot be changed now", 409, req);
    }

    const { success: rateLimitOk, headers: rateLimitHeaders } =
      await checkRateLimit(advertisingProofUploadLimiter, user.id);
    if (!rateLimitOk) {
      const response = errorResponse(
        "Too many proof uploads. Please try again later.",
        429,
        req,
      );
      rateLimitHeaders.forEach((value, key) => {
        response.headers.set(key, value);
      });
      return response;
    }

    const { data: storedProofFolders, error: storageListError } =
      await supabaseAdmin.storage
        .from(ADVERTISER_PROOF_BUCKET)
        .list(user.id, { limit: 10 });
    if (storageListError) throw storageListError;
    if ((storedProofFolders?.length ?? 0) >= 10) {
      return errorResponse(
        "Proof upload limit reached. Contact Roogo support.",
        409,
        req,
      );
    }

    const parsed = uploadRequestSchema.safeParse(await req.json());
    if (!parsed.success) return errorResponse("Invalid proof file", 400, req);
    if (
      parsed.data.kind === "storefront_photo" &&
      parsed.data.mimeType === "application/pdf"
    ) {
      return errorResponse("A storefront proof must be an image", 400, req);
    }
    if (
      parsed.data.kind === "social_profile" ||
      parsed.data.kind === "website"
    ) {
      return errorResponse("This proof type requires a URL", 400, req);
    }

    const extension = safeExtension(parsed.data.fileName, parsed.data.mimeType);
    const path = `${user.id}/${crypto.randomUUID()}/${parsed.data.kind}/proof.${extension}`;
    const { data, error } = await supabaseAdmin.storage
      .from(ADVERTISER_PROOF_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) throw error ?? new Error("Upload URL unavailable");

    return cors(
      NextResponse.json({
        success: true,
        upload: {
          path: data.path,
          signedUrl: data.signedUrl,
          token: data.token,
        },
      }),
      req,
    );
  } catch (error) {
    console.error("POST /api/advertising/profile/proof/upload-url:", error);
    return errorResponse(
      safeError(error, "Failed to create proof upload URL"),
      500,
      req,
    );
  }
}
