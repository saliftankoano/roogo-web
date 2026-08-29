import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse, safeError } from "@/lib/api-helpers";
import {
  ADVERTISER_PROOF_BUCKET,
  MAX_ADVERTISER_PROOF_BYTES,
  advertiserProofKindSchema,
  canAccessAdvertisingOnboarding,
  getAdvertiserProofStorageMimeType,
} from "@/lib/advertising";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { z } from "zod";

const proofSchema = z.object({
  kind: advertiserProofKindSchema,
  storagePath: z.string().trim().max(500).nullable().optional(),
  externalUrl: z.string().trim().url().max(500).nullable().optional(),
  originalFileName: z.string().trim().max(180).nullable().optional(),
});

export async function OPTIONS(req: Request) {
  return corsOptions(req);
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

    const parsed = proofSchema.safeParse(await req.json());
    if (!parsed.success) return errorResponse("Invalid business proof", 400, req);
    const { kind, storagePath, externalUrl, originalFileName } =
      parsed.data;
    const isUrlProof = kind === "social_profile" || kind === "website";
    let verifiedMimeType: string | null = null;

    if (isUrlProof) {
      if (!externalUrl || storagePath) {
        return errorResponse("A valid proof URL is required", 400, req);
      }
      const url = new URL(externalUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        return errorResponse("Unsupported proof URL", 400, req);
      }
    } else {
      if (!storagePath?.startsWith(`${user.id}/`) || externalUrl) {
        return errorResponse("Invalid proof upload path", 400, req);
      }
      verifiedMimeType = getAdvertiserProofStorageMimeType(
        storagePath,
        user.id,
        kind,
      );
      if (!verifiedMimeType) {
        return errorResponse("Proof upload does not match its type", 400, req);
      }

      const fileName = storagePath.split("/").pop();
      const { data, error: storageError } = await supabaseAdmin.storage
        .from(ADVERTISER_PROOF_BUCKET)
        .list(storagePath.split("/").slice(0, -1).join("/"), {
          search: fileName,
          limit: 1,
        });
      if (storageError) throw storageError;
      const storedObject = data?.find((entry) => entry.name === fileName);
      if (!storedObject) {
        return errorResponse("Uploaded proof was not found", 400, req);
      }

      const storedMimeType =
        typeof storedObject.metadata?.mimetype === "string"
          ? storedObject.metadata.mimetype.split(";", 1)[0].trim().toLowerCase()
          : null;
      if (storedMimeType && storedMimeType !== verifiedMimeType) {
        return errorResponse("Uploaded proof content type is invalid", 400, req);
      }
      if (
        typeof storedObject.metadata?.size === "number" &&
        storedObject.metadata.size > MAX_ADVERTISER_PROOF_BYTES
      ) {
        return errorResponse("Uploaded proof exceeds the size limit", 400, req);
      }
    }

    const { data: existingProfile, error: lookupError } = await supabaseAdmin
      .from("advertiser_profiles")
      .select("id, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (
      existingProfile &&
      ["approved", "pending", "suspended"].includes(existingProfile.status)
    ) {
      return errorResponse("Business proof cannot be changed now", 409, req);
    }

    let profile = existingProfile;
    if (!profile) {
      const { data: createdProfile, error: profileError } = await supabaseAdmin
        .from("advertiser_profiles")
        .insert({ user_id: user.id, status: "draft" })
        .select("id, status")
        .single();
      if (profileError) throw profileError;
      profile = createdProfile;
    }

    const { data: proof, error } = await supabaseAdmin
      .from("advertiser_profile_proofs")
      .insert({
        advertiser_profile_id: profile.id,
        kind,
        storage_path: storagePath ?? null,
        external_url: externalUrl ?? null,
        original_file_name: originalFileName ?? null,
        mime_type: verifiedMimeType,
        status: "pending",
      })
      .select(
        "id, kind, external_url, original_file_name, mime_type, status, created_at",
      )
      .single();
    if (error) throw error;

    return cors(
      NextResponse.json({
        success: true,
        proof: {
          id: proof.id,
          kind: proof.kind,
          externalUrl: proof.external_url,
          originalFileName: proof.original_file_name,
          mimeType: proof.mime_type,
          status: proof.status,
          createdAt: proof.created_at,
        },
      }),
      req,
    );
  } catch (error) {
    console.error("POST /api/advertising/profile/proof:", error);
    return errorResponse(
      safeError(error, "Failed to save business proof"),
      500,
      req,
    );
  }
}
