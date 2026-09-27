import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  validateSaleEconomics,
  type SaleEconomicsSnapshot,
} from "@/lib/sale-economics";

// Use service role to bypass RLS for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface Tier {
  id: string;
  name: string;
  photo_limit: number;
  slot_limit: number;
  video_included: boolean;
  open_house_limit: number;
  has_badge: boolean;
  min_price: number;
  created_at: string;
}

interface Addon {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ErrorItem {
  type: string;
  id: string;
  error: string;
}

const SALE_LADDER_COLUMNS =
  "listing_markup_pct, target_markup_pct, team_floor_markup_pct, hard_floor_markup_pct, notary_fee_pct, buyer_referral_pct, seller_referral_pct";

type SaleLadderRow = {
  listing_markup_pct: number;
  target_markup_pct: number;
  team_floor_markup_pct: number;
  hard_floor_markup_pct: number;
  notary_fee_pct: number;
  buyer_referral_pct: number;
  seller_referral_pct: number;
};

type SaleBypassRow = {
  sale_bypass_fee_pct: number;
  sale_bypass_months: number;
};

/** Roogo Sell v3 settings, or null until migration 075 has run. */
async function readSaleEconomics(): Promise<SaleEconomicsSnapshot | null> {
  const [{ data: ladder }, { data: bypass }] = await Promise.all([
    supabaseAdmin
      .from("sale_economics_config")
      .select(SALE_LADDER_COLUMNS)
      .eq("id", "default")
      .maybeSingle<SaleLadderRow>(),
    supabaseAdmin
      .from("listing_config")
      .select("sale_bypass_fee_pct, sale_bypass_months")
      .eq("id", "default")
      .maybeSingle<SaleBypassRow>(),
  ]);
  if (!ladder || !bypass) return null;
  return {
    listingMarkupPct: Number(ladder.listing_markup_pct),
    targetMarkupPct: Number(ladder.target_markup_pct),
    teamFloorMarkupPct: Number(ladder.team_floor_markup_pct),
    hardFloorMarkupPct: Number(ladder.hard_floor_markup_pct),
    notaryFeePct: Number(ladder.notary_fee_pct),
    buyerReferralPct: Number(ladder.buyer_referral_pct),
    sellerReferralPct: Number(ladder.seller_referral_pct),
    bypassFeePct: Number(bypass.sale_bypass_fee_pct),
    bypassMonths: Number(bypass.sale_bypass_months),
  };
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is founder
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userType = user.publicMetadata?.userType;

    if (userType !== "founder") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch listing tiers
    const { data: tiers, error: tiersError } = await supabaseAdmin
      .from("listing_tiers")
      .select("*")
      .order("min_price", { ascending: true });

    if (tiersError) {
      console.error("Error fetching tiers:", tiersError);
      return NextResponse.json({ error: tiersError.message }, { status: 500 });
    }

    // Fetch add-ons
    const { data: addons, error: addonsError } = await supabaseAdmin
      .from("listing_addons")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (addonsError) {
      console.error("Error fetching add-ons:", addonsError);
      return NextResponse.json({ error: addonsError.message }, { status: 500 });
    }

    // Fetch commission percentages
    const { data: configData, error: configError } = await supabaseAdmin
      .from("listing_config")
      .select("commission_percentage, daily_owner_commission_percentage")
      .eq("id", "default")
      .single();

    // Sale v2 knobs (migration 050), read-only history: new mandates use v3.
    const { data: saleConfigData } = await supabaseAdmin
      .from("listing_config")
      .select(
        "sale_base_commission_percentage, sale_surplus_split_percentage, sale_notary_price_basis",
      )
      .eq("id", "default")
      .maybeSingle();

    // Sale v3 settings (migration 075); null until it has run.
    const saleEconomics = await readSaleEconomics();

    if (configError) {
      console.error("Error fetching listing config:", configError);
      return NextResponse.json({ error: configError.message }, { status: 500 });
    }

    if (
      typeof configData?.commission_percentage !== "number" ||
      typeof configData?.daily_owner_commission_percentage !== "number"
    ) {
      return NextResponse.json(
        { error: "Commission percentages are not configured" },
        { status: 500 },
      );
    }

    const commissionPercentage = configData.commission_percentage;
    const dailyOwnerCommissionPercentage =
      configData.daily_owner_commission_percentage;

    return NextResponse.json({
      tiers,
      addons: addons || [],
      commissionPercentage,
      dailyOwnerCommissionPercentage,
      saleEconomics,
      // Sale v2 knobs (read-only history); null until migration 050 runs.
      saleBaseCommissionPercentage:
        typeof saleConfigData?.sale_base_commission_percentage === "number"
          ? saleConfigData.sale_base_commission_percentage
          : null,
      saleSurplusSplitPercentage:
        typeof saleConfigData?.sale_surplus_split_percentage === "number"
          ? saleConfigData.sale_surplus_split_percentage
          : null,
      saleNotaryPriceBasis:
        saleConfigData?.sale_notary_price_basis === "list" ? "list" : "desired",
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is founder
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userType = user.publicMetadata?.userType;

    if (userType !== "founder") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      tiers,
      addons,
      commissionPercentage,
      dailyOwnerCommissionPercentage,
      saleEconomics,
    } = body;

    const results: {
      tiers: Tier[];
      addons: Addon[];
      commissionPercentage?: number;
      dailyOwnerCommissionPercentage?: number;
      saleEconomics?: SaleEconomicsSnapshot;
      errors: ErrorItem[];
    } = { tiers: [], addons: [], errors: [] };

    // Update tiers if provided
    if (tiers && Array.isArray(tiers)) {
      for (const tier of tiers) {
        const {
          id,
          min_price,
          photo_limit,
          slot_limit,
          video_included,
          open_house_limit,
          has_badge,
        } = tier;

        if (!id || min_price === undefined) {
          results.errors.push({
            type: "tier",
            id,
            error: "Missing required fields",
          });
          continue;
        }

        const updatePayload: Partial<
          Pick<
            Tier,
            | "min_price"
            | "photo_limit"
            | "slot_limit"
            | "video_included"
            | "open_house_limit"
            | "has_badge"
          >
        > = { min_price };

        if (photo_limit !== undefined) updatePayload.photo_limit = photo_limit;
        if (slot_limit !== undefined) updatePayload.slot_limit = slot_limit;
        if (video_included !== undefined) {
          updatePayload.video_included = video_included;
        }
        if (open_house_limit !== undefined) {
          updatePayload.open_house_limit = open_house_limit;
        }
        if (has_badge !== undefined) updatePayload.has_badge = has_badge;

        const { data, error } = await supabaseAdmin
          .from("listing_tiers")
          .update(updatePayload)
          .eq("id", id)
          .select()
          .single();

        if (error) {
          console.error(`Error updating tier ${id}:`, error);
          results.errors.push({ type: "tier", id, error: error.message });
        } else {
          results.tiers.push(data);
        }
      }
    }

    // Update add-ons if provided
    if (addons && Array.isArray(addons)) {
      for (const addon of addons) {
        const { id, price } = addon;

        if (!id || price === undefined) {
          results.errors.push({
            type: "addon",
            id,
            error: "Missing required fields",
          });
          continue;
        }

        const { data, error } = await supabaseAdmin
          .from("listing_addons")
          .update({ price, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();

        if (error) {
          console.error(`Error updating addon ${id}:`, error);
          results.errors.push({ type: "addon", id, error: error.message });
        } else {
          results.addons.push(data);
        }
      }
    }

    // Update commission percentages if provided
    if (
      commissionPercentage !== undefined ||
      dailyOwnerCommissionPercentage !== undefined
    ) {
      const updatePayload: {
        commission_percentage?: number;
        daily_owner_commission_percentage?: number;
        updated_at: string;
      } = {
        updated_at: new Date().toISOString(),
      };

      if (commissionPercentage !== undefined) {
        updatePayload.commission_percentage = commissionPercentage;
      }
      if (dailyOwnerCommissionPercentage !== undefined) {
        updatePayload.daily_owner_commission_percentage =
          dailyOwnerCommissionPercentage;
      }

      const { data, error } = await supabaseAdmin
        .from("listing_config")
        .update(updatePayload)
        .eq("id", "default")
        .select()
        .single();

      if (error) {
        // Try insert if update fails (e.g. row doesn't exist)
        const { data: insertData, error: insertError } = await supabaseAdmin
          .from("listing_config")
          .upsert({
            id: "default",
            commission_percentage: commissionPercentage ?? 0.05,
            daily_owner_commission_percentage:
              dailyOwnerCommissionPercentage ?? 0.1,
            updated_at: updatePayload.updated_at,
          })
          .select()
          .single();

        if (insertError) {
          console.error("Error updating commission percentage:", insertError);
          results.errors.push({
            type: "config",
            id: "default",
            error: insertError.message,
          });
        } else {
          results.commissionPercentage = insertData.commission_percentage;
          results.dailyOwnerCommissionPercentage =
            insertData.daily_owner_commission_percentage;
        }
      } else {
        results.commissionPercentage = data.commission_percentage;
        results.dailyOwnerCommissionPercentage =
          data.daily_owner_commission_percentage;
      }
    }

    // Update the Roogo Sell v3 settings if provided. Percentages are decimal
    // fractions. Already-sent mandates keep their snapshots; only new mandates
    // pick these up. The v2 knobs are no longer editable (history only).
    if (saleEconomics && typeof saleEconomics === "object") {
      const current = await readSaleEconomics();
      if (!current) {
        results.errors.push({
          type: "sale_economics",
          id: "default",
          error: "Migration 075 has not run",
        });
      } else {
        const incoming = saleEconomics as Partial<Record<string, unknown>>;
        const merged = { ...current };
        for (const key of Object.keys(current) as (keyof SaleEconomicsSnapshot)[]) {
          if (typeof incoming[key] === "number") merged[key] = incoming[key] as number;
        }
        const problems = validateSaleEconomics(merged);
        if (problems.length > 0) {
          results.errors.push({
            type: "sale_economics",
            id: "default",
            error: problems.join("; "),
          });
        } else {
          const now = new Date().toISOString();
          const [{ error: ladderError }, { error: bypassError }] =
            await Promise.all([
              supabaseAdmin
                .from("sale_economics_config")
                .update({
                  listing_markup_pct: merged.listingMarkupPct,
                  target_markup_pct: merged.targetMarkupPct,
                  team_floor_markup_pct: merged.teamFloorMarkupPct,
                  hard_floor_markup_pct: merged.hardFloorMarkupPct,
                  notary_fee_pct: merged.notaryFeePct,
                  buyer_referral_pct: merged.buyerReferralPct,
                  seller_referral_pct: merged.sellerReferralPct,
                  updated_at: now,
                })
                .eq("id", "default"),
              supabaseAdmin
                .from("listing_config")
                .update({
                  sale_bypass_fee_pct: merged.bypassFeePct,
                  sale_bypass_months: merged.bypassMonths,
                  updated_at: now,
                })
                .eq("id", "default"),
            ]);
          const saleError = ladderError ?? bypassError;
          if (saleError) {
            console.error("Error updating sale economics config:", saleError);
            results.errors.push({
              type: "sale_economics",
              id: "default",
              error: saleError.message,
            });
          } else {
            results.saleEconomics = merged;
          }
        }
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
