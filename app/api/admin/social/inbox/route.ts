import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { loadInbox } from "@/lib/social/inbox-server";

export const dynamic = "force-dynamic";

// Studio > Réseaux: comments and direct messages with the team's status.
// Conseiller(ère) and above ("social.inbox").
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req, "social.inbox");
  if (!staff) return errorResponse("Forbidden", 403, req);
  return NextResponse.json(await loadInbox());
}
