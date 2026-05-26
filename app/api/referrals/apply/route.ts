import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse, safeError } from "@/lib/api-helpers";
import { resolveSupabaseUserFromRequest } from "@/lib/referral-auth";
import { generateReferralCode } from "@/lib/referrals";
import { getSupabaseClient } from "@/lib/user-sync";

const BUCKET = "referrer-verification";
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getImageFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  if (!(value instanceof File)) return null;
  if (!value.type.startsWith("image/")) return null;
  if (value.size <= 0 || value.size > MAX_FILE_BYTES) return null;
  return value;
}

function safeFileName(file: File, fallback: string): string {
  const ext = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  return `${fallback}.${ext.toLowerCase()}`;
}

async function uploadVerificationFile(params: {
  file: File;
  userId: string;
  side: "front" | "back";
}) {
  const bytes = await params.file.arrayBuffer();
  const path = `${params.userId}/${Date.now()}-${safeFileName(
    params.file,
    params.side,
  )}`;

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: params.file.type,
      upsert: false,
    });

  if (error) throw error;
  return path;
}

export async function POST(req: Request) {
  try {
    const user = await resolveSupabaseUserFromRequest(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const formData = await req.formData();
    const legalName = readText(formData, "legalName");
    const cityZone = readText(formData, "cityZone");
    const payoutPhone = readText(formData, "payoutPhone").replace(/\s+/g, "");
    const payoutProvider = readText(formData, "payoutProvider");
    const frontFile = getImageFile(formData, "idFront");
    const backFile = getImageFile(formData, "idBack");

    if (!legalName || legalName.length < 2) {
      return errorResponse("Legal name is required", 400, req);
    }
    if (!cityZone || cityZone.length < 2) {
      return errorResponse("City/zone is required", 400, req);
    }
    if (!/^[0-9+]{8,16}$/.test(payoutPhone)) {
      return errorResponse("Invalid payout phone", 400, req);
    }
    if (!["ORANGE_MONEY", "MOOV_MONEY"].includes(payoutProvider)) {
      return errorResponse("Invalid payout provider", 400, req);
    }
    if (!frontFile || !backFile) {
      return errorResponse("Front and back ID photos are required", 400, req);
    }

    const supabase = getSupabaseClient();
    const { data: existing } = await supabase
      .from("referrer_profiles")
      .select("id, code, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing?.status === "approved") {
      return errorResponse("This referrer profile is already approved", 409, req);
    }
    if (existing?.status === "suspended") {
      return errorResponse("This referrer profile is suspended", 409, req);
    }

    const [frontPath, backPath] = await Promise.all([
      uploadVerificationFile({ file: frontFile, userId: user.id, side: "front" }),
      uploadVerificationFile({ file: backFile, userId: user.id, side: "back" }),
    ]);

    const code =
      existing?.code ||
      (await generateReferralCode(supabase, {
        full_name: user.full_name,
        email: user.email,
      }));

    const payload = {
      user_id: user.id,
      code,
      status: "pending",
      legal_name: legalName,
      city_zone: cityZone,
      payout_phone: payoutPhone,
      payout_provider: payoutProvider,
      id_front_path: frontPath,
      id_back_path: backPath,
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      rejection_reason: null,
    };

    const { data: profile, error } = await supabase
      .from("referrer_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();

    if (error) throw error;
    return cors(NextResponse.json({ success: true, profile }), req);
  } catch (error) {
    console.error("POST /api/referrals/apply error:", error);
    return errorResponse(safeError(error, "Failed to submit application"), 500, req);
  }
}
