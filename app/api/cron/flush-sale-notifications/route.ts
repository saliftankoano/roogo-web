import { NextResponse } from "next/server";
import { flushDeferredSaleNotifications } from "@/lib/sale-notifications";

// Vercel cron: drains sale-chat notifications deferred during quiet hours
// (22:00–07:00 GMT) and sends one summarized push per recipient.
// Scheduled for 07:00 UTC in vercel.json.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sent = await flushDeferredSaleNotifications();
    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("flush-sale-notifications failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
