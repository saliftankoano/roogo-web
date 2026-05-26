import { NextResponse } from "next/server";
import { requireAdminSupabaseUser } from "@/lib/referral-auth";
import { getSupabaseClient } from "@/lib/user-sync";

const BUCKET = "referrer-verification";

async function signedUrl(path: string | null) {
  if (!path) return null;
  const supabase = getSupabaseClient();
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 10 * 60);
  return data?.signedUrl ?? null;
}

export async function GET() {
  try {
    await requireAdminSupabaseUser();
    const supabase = getSupabaseClient();

    const [{ data: profiles }, { data: redemptions }, { data: commissions }] =
      await Promise.all([
        supabase
          .from("referrer_profiles")
          .select(
            "*, users:user_id(id, full_name, email, user_type, phone, whatsapp)",
          )
          .order("submitted_at", { ascending: false }),
        supabase
          .from("referral_redemptions")
          .select(
            "*, referrer_profiles:referrer_profile_id(id, code, legal_name), users:referred_user_id(id, full_name, email, user_type), properties:property_id(id, quartier, address), transactions:transaction_id(id, deposit_id, status)",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("referral_commissions")
          .select(
            "*, referrer_profiles:referrer_profile_id(id, code, legal_name), referral_redemptions:redemption_id(id, code_used, property_id, paid_amount)",
          )
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

    const profilesWithUrls = await Promise.all(
      (profiles || []).map(async (profile) => ({
        ...profile,
        idFrontUrl: await signedUrl(profile.id_front_path),
        idBackUrl: await signedUrl(profile.id_back_path),
      })),
    );

    return NextResponse.json({
      profiles: profilesWithUrls,
      redemptions: redemptions || [],
      commissions: commissions || [],
    });
  } catch (error) {
    console.error("GET /api/admin/referrals error:", error);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
