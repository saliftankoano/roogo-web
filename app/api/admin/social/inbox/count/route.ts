import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { inboxCounts } from "@/lib/social/inbox-server";

export const dynamic = "force-dynamic";

// The « À répondre » badge on the Studio menu item and the Réseaux tab.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req, "social.inbox");
  if (!staff) return errorResponse("Forbidden", 403, req);
  return NextResponse.json(await inboxCounts());
}
