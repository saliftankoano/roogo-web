import { after, NextResponse } from "next/server";
import { cors, corsOptions, errorResponse, safeError } from "@/lib/api-helpers";
import {
  advertiserProfileInputSchema,
  canAccessAdvertisingOnboarding,
  mapAdvertiserProfile,
  profileInputToRow,
} from "@/lib/advertising";
import { captureServerEvent } from "@/lib/posthog-server";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

async function resolveUser(req: Request) {
  const clerkUserId = await resolveClerkId(req);
  if (!clerkUserId) return null;
  return getOrSyncUserByClerkId(clerkUserId);
}

async function loadProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("advertiser_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);
    if (!canAccessAdvertisingOnboarding(user.user_type)) {
      return errorResponse("Advertising onboarding is not enabled", 403, req);
    }

    const profile = await loadProfile(user.id);
    let proof: Record<string, unknown> | null = null;
    if (profile?.id) {
      const { data, error } = await supabaseAdmin
        .from("advertiser_profile_proofs")
        .select(
          "id, kind, external_url, original_file_name, mime_type, status, review_notes, created_at",
        )
        .eq("advertiser_profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      proof = data;
    }

    return cors(
      NextResponse.json({
        success: true,
        profile: mapAdvertiserProfile(profile),
        proof: proof
          ? {
              id: proof.id,
              kind: proof.kind,
              externalUrl: proof.external_url,
              originalFileName: proof.original_file_name,
              mimeType: proof.mime_type,
              status: proof.status,
              reviewNotes: proof.review_notes,
              createdAt: proof.created_at,
            }
          : null,
      }),
      req,
    );
  } catch (error) {
    console.error("GET /api/advertising/profile:", error);
    return errorResponse(
      safeError(error, "Failed to load advertiser profile"),
      500,
      req,
    );
  }
}

export async function PUT(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);
    if (!canAccessAdvertisingOnboarding(user.user_type)) {
      return errorResponse("Advertising onboarding is not enabled", 403, req);
    }

    const parsed = advertiserProfileInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse("Invalid advertiser profile", 400, req);
    }

    const existing = await loadProfile(user.id);
    if (existing?.status === "approved") {
      return errorResponse(
        "Approved business details must be changed through a reviewed revision",
        409,
        req,
      );
    }
    if (existing?.status === "pending") {
      return errorResponse("This profile is already under review", 409, req);
    }
    if (existing?.status === "suspended") {
      return errorResponse("This advertising profile is suspended", 403, req);
    }

    const row = {
      user_id: user.id,
      ...profileInputToRow(parsed.data),
      status: "draft",
      submitted_at: null,
      reviewed_at: null,
      reviewed_by: null,
      rejection_reason: null,
      review_notes: null,
    };

    const { data: profile, error } = await supabaseAdmin
      .from("advertiser_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw error;

    after(async () => {
      try {
        await captureServerEvent(user.id, "advertiser_profile_saved", {
          advertiser_profile_id: profile.id,
          status: profile.status,
        });
      } catch (analyticsError) {
        console.error("Advertiser profile save analytics failed:", analyticsError);
      }
    });

    return cors(
      NextResponse.json({
        success: true,
        profile: mapAdvertiserProfile(profile),
      }),
      req,
    );
  } catch (error) {
    console.error("PUT /api/advertising/profile:", error);
    return errorResponse(
      safeError(error, "Failed to save advertiser profile"),
      500,
      req,
    );
  }
}
