import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

const ZERO_SUMMARY = {
  grossRentEarned: 0,
  platformFees: 0,
  netRentEarned: 0,
  pendingPayouts: 0,
  completedPayouts: 0,
  availableBalance: 0,
  availableRentCredits: 0,
  totalRentCredits: 0,
  pendingAvailableBalance: 0,
  pendingAvailableRentCredits: 0,
  currency: "XOF",
  feeRateBps: 700,
};

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  try {
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
    if (!["owner", "agent", "staff", "founder"].includes(user.user_type)) {
      return errorResponse("Forbidden", 403, req);
    }

    const { data: summaryRow } = await supabaseAdmin
      .from("owner_wallet_summary")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();

    const { data: earningsRows, error: earningsError } = await supabaseAdmin
      .from("owner_earnings")
      .select("*")
      .eq("owner_id", user.id)
      .order("earned_at", { ascending: false })
      .limit(200);

    if (earningsError) {
      console.error("Error fetching owner earnings:", earningsError);
      return errorResponse("Failed to fetch wallet", 500, req);
    }

    const earnings = earningsRows || [];
    const earningIds = earnings.map((earning) => earning.id);
    const scheduleIds = earnings
      .map((earning) => earning.schedule_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const propertyIds = [
      ...new Set(
        earnings
          .map((earning) => earning.property_id)
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
      ),
    ];
    const agreementIds = [
      ...new Set(
        earnings
          .map((earning) => earning.agreement_id)
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
      ),
    ];

    const [
      { data: schedulesRows },
      { data: propertiesRows },
      { data: agreementsRows },
      { data: activeItemsRows },
      { data: payoutsRows },
    ] = await Promise.all([
      scheduleIds.length
        ? supabaseAdmin
            .from("rent_schedules")
            .select(
              `
                id,
                due_date,
                paid_at,
                renter:users!rent_schedules_renter_id_fkey(id, full_name, phone),
                properties(id, address, quartier, city, property_images(url, is_primary))
              `,
            )
            .in("id", scheduleIds)
        : Promise.resolve({ data: [] }),
      propertyIds.length
        ? supabaseAdmin
            .from("properties")
            .select(
              "id, address, quartier, city, property_images(url, is_primary)",
            )
            .in("id", propertyIds)
        : Promise.resolve({ data: [] }),
      agreementIds.length
        ? supabaseAdmin
            .from("rental_agreements")
            .select(
              "id, start_date, end_date, renter:users!rental_agreements_renter_id_fkey(id, full_name, phone)",
            )
            .in("id", agreementIds)
        : Promise.resolve({ data: [] }),
      earningIds.length
        ? supabaseAdmin
            .from("owner_payout_items")
            .select("earning_id")
            .in("earning_id", earningIds)
            .is("released_at", null)
        : Promise.resolve({ data: [] }),
      supabaseAdmin
        .from("owner_payouts")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const scheduleById = new Map(
      (schedulesRows || []).map((schedule) => [schedule.id, schedule]),
    );
    const propertyById = new Map(
      (propertiesRows || []).map((property) => [property.id, property]),
    );
    const agreementById = new Map(
      (agreementsRows || []).map((agreement) => [agreement.id, agreement]),
    );
    const activeEarningIds = new Set(
      (activeItemsRows || []).map((item) => item.earning_id),
    );
    const payoutIds = (payoutsRows || []).map((payout) => payout.id);
    const { data: payoutItemsRows } = payoutIds.length
      ? await supabaseAdmin
          .from("owner_payout_items")
          .select("*")
          .in("payout_id", payoutIds)
      : { data: [] };

    const earningsById = new Map(
      earnings.map((earning) => [earning.id, earning]),
    );
    const payoutItemsByPayout = new Map<string, unknown[]>();
    for (const item of payoutItemsRows || []) {
      const list = payoutItemsByPayout.get(item.payout_id) || [];
      list.push({
        ...item,
        earning: earningsById.get(item.earning_id) || null,
      });
      payoutItemsByPayout.set(item.payout_id, list);
    }

    const hydratedEarnings = earnings.map((earning) => ({
      ...earning,
      schedule: scheduleById.get(earning.schedule_id) || null,
      property: propertyById.get(earning.property_id) || null,
      agreement: agreementById.get(earning.agreement_id) || null,
    }));

    const nowIso = new Date().toISOString();
    const availableEarnings = hydratedEarnings.filter(
      (earning) =>
        !activeEarningIds.has(earning.id) &&
        (!earning.available_at || earning.available_at <= nowIso),
    );
    const pendingAvailableEarnings = hydratedEarnings.filter(
      (earning) =>
        !activeEarningIds.has(earning.id) &&
        earning.available_at &&
        earning.available_at > nowIso,
    );

    const summary = summaryRow
      ? {
          grossRentEarned: summaryRow.gross_rent_earned || 0,
          platformFees: summaryRow.platform_fees || 0,
          netRentEarned: summaryRow.net_rent_earned || 0,
          pendingPayouts: summaryRow.pending_payouts || 0,
          completedPayouts: summaryRow.completed_payouts || 0,
          availableBalance: summaryRow.available_balance || 0,
          availableRentCredits: summaryRow.available_rent_credits || 0,
          totalRentCredits: summaryRow.total_rent_credits || 0,
          pendingAvailableBalance: pendingAvailableEarnings.reduce(
            (sum, earning) => sum + Number(earning.net_amount || 0),
            0,
          ),
          pendingAvailableRentCredits: pendingAvailableEarnings.length,
          currency: "XOF",
          feeRateBps: 700,
        }
      : ZERO_SUMMARY;

    return cors(
      NextResponse.json({
        summary,
        owner: {
          phone: user.phone || null,
          whatsapp: user.whatsapp || null,
        },
        availableEarnings,
        earnings: hydratedEarnings,
        payouts: (payoutsRows || []).map((payout) => ({
          ...payout,
          items: payoutItemsByPayout.get(payout.id) || [],
        })),
      }),
      req,
    );
  } catch (error) {
    console.error("Error in GET /api/owner-wallet:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
