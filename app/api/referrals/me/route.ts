import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveSupabaseUserFromRequest } from "@/lib/referral-auth";
import { getSupabaseClient } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  try {
    const user = await resolveSupabaseUserFromRequest(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const supabase = getSupabaseClient();
    const { data: profile, error: profileError } = await supabase
      .from("referrer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to load referrer profile:", profileError);
      return errorResponse("Failed to load profile", 500, req);
    }

    if (!profile) {
      return cors(NextResponse.json({ profile: null }), req);
    }

    const profileForClient =
      profile.status === "approved" ? profile : { ...profile, code: null };

    if (profile.status !== "approved") {
      return cors(
        NextResponse.json({
          profile: profileForClient,
          redemptions: [],
          commissions: [],
          totals: { pending: 0, paid: 0 },
        }),
        req,
      );
    }

    const [{ data: redemptions }, { data: commissions }] = await Promise.all([
      supabase
        .from("referral_redemptions")
        .select(
          "id, code_used, original_amount, discount_amount, paid_amount, status, created_at, properties:property_id(id, quartier, address), transactions:transaction_id(id, deposit_id, status)",
        )
        .eq("referrer_profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("referral_commissions")
        .select("id, amount, currency, status, paid_at, created_at")
        .eq("referrer_profile_id", profile.id)
        .order("created_at", { ascending: false }),
    ]);

    const commissionRows = commissions || [];
    const totals = commissionRows.reduce(
      (acc, row) => {
        const amount = Number(row.amount || 0);
        if (row.status === "paid") acc.paid += amount;
        else if (row.status === "pending" || row.status === "approved")
          acc.pending += amount;
        return acc;
      },
      { pending: 0, paid: 0 },
    );

    return cors(
      NextResponse.json({
        profile: profileForClient,
        redemptions: redemptions || [],
        commissions: commissionRows,
        totals,
      }),
      req,
    );
  } catch (error) {
    console.error("GET /api/referrals/me error:", error);
    return errorResponse("Unauthorized", 401, req);
  }
}
