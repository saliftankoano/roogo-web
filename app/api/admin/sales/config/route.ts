import { NextResponse } from "next/server";
import { getStaffOrFounder } from "@/lib/api-auth";
import { getSaleEconomicsConfig } from "@/lib/sale-mandate";

// GET: the live Roogo Sell v3 economics for staff tools (mandate preview, ladder).
// Staff only: the ladder and floors are private business terms.
export async function GET(req: Request) {
  const user = await getStaffOrFounder(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const saleEconomics = await getSaleEconomicsConfig();
    return NextResponse.json({ success: true, saleEconomics });
  } catch (error) {
    console.error(
      "GET /api/admin/sales/config:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "sale_economics_not_configured", saleEconomics: null },
      { status: 503 },
    );
  }
}
