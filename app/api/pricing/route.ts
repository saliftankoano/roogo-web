import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_MANDATE_EXCLUSIVITY_DAYS } from "@/lib/sale";

// Use service role to read pricing data (read-only, no auth required)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
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
      console.error("Error fetching addons:", addonsError);
      // Add-ons table might not exist yet, so we'll just return tiers
      return NextResponse.json({ tiers, addons: [] });
    }

    // Fetch commission percentages (required)
    const { data: configData, error: configError } = await supabaseAdmin
      .from("listing_config")
      .select("commission_percentage, daily_owner_commission_percentage")
      .eq("id", "default")
      .single();

    if (
      configError ||
      typeof configData?.commission_percentage !== "number" ||
      typeof configData?.daily_owner_commission_percentage !== "number"
    ) {
      console.error("Error fetching listing config:", configError);
      return NextResponse.json(
        { error: "Commission percentages are not configured" },
        { status: 500 },
      );
    }

    let commissionPercentage = configData.commission_percentage;
    const dailyOwnerCommissionPercentage =
      configData.daily_owner_commission_percentage;

    // Apply dev pricing overrides if configured (for local testing)
    if (process.env.DEV_PRICING_OVERRIDE === "true") {
      const overridePrice = parseFloat(process.env.DEV_TIER_PRICE || "0");
      if (overridePrice > 0 && tiers) {
        tiers.forEach((tier: { min_price: number }) => {
          tier.min_price = overridePrice;
        });
      }

      const overrideCommission = process.env.DEV_COMMISSION_PERCENTAGE;
      if (overrideCommission !== undefined) {
        commissionPercentage = parseFloat(overrideCommission);
      }

      const overrideAddonPrice = parseFloat(process.env.DEV_ADDON_PRICE || "0");
      if (overrideAddonPrice >= 0 && addons) {
        addons.forEach((addon: { price: number }) => {
          addon.price = overrideAddonPrice;
        });
      }

      console.log("[DEV] Pricing overrides applied", {
        tierPrice: overridePrice,
        commissionPercentage,
        addonPrice: overrideAddonPrice,
      });
    }

    // Roogo Sell v3: only the seller-facing terms (bypass clause, default
    // exclusivity). The price ladder and fee split are private
    // (sale_economics_config, service role only) and never exposed here. The v2
    // percentages are no longer returned; no client reads them from this route
    // (old mobile builds read listing_config directly). Best-effort so this
    // endpoint keeps working before migration 075 runs.
    const { data: saleConfigData } = await supabaseAdmin
      .from("listing_config")
      .select("sale_bypass_fee_pct, sale_bypass_months")
      .eq("id", "default")
      .maybeSingle();

    return NextResponse.json({
      tiers,
      addons,
      commissionPercentage,
      dailyOwnerCommissionPercentage,
      saleBypassFeePercentage:
        typeof saleConfigData?.sale_bypass_fee_pct === "number"
          ? saleConfigData.sale_bypass_fee_pct
          : null,
      saleBypassMonths:
        typeof saleConfigData?.sale_bypass_months === "number"
          ? saleConfigData.sale_bypass_months
          : null,
      saleDefaultExclusivityDays: DEFAULT_MANDATE_EXCLUSIVITY_DAYS,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
