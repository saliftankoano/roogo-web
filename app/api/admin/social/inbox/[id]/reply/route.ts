import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { replyToItem } from "@/lib/social/inbox-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

// Sends a reply as the Roogo Page / Instagram account (comment reply or
// Messenger/Instagram Send API inside Meta's 24-hour window). Every attempt,
// sent or failed, is logged in social_inbox_replies with the staff member.
export async function POST(req: Request, { params }: Ctx) {
  const staff = await getStaffOrFounder(req, "social.inbox");
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const result = await replyToItem(id, staff.id, body?.text);
  if (!result.ok) return errorResponse(result.error, result.status, req);
  return NextResponse.json({ item: result.item });
}
