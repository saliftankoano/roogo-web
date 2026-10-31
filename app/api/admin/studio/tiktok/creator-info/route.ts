import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { roleOf } from "@/lib/studio/publishing-server";
import { creatorInfoNow, tiktokDemo, tiktokPanelRequired } from "@/lib/social/tiktok-settings-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The TikTok panel of the approval screen reads the account's creator info
// fresh each time it opens (TikTok's Content Sharing Guidelines). Founder only:
// the founder approves and owns the TikTok connection. No token in the answer.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  if (roleOf(staff) !== "founder") return errorResponse("Seul un fondateur valide les publications TikTok.", 403, req);
  if (!(await tiktokPanelRequired())) return cors(NextResponse.json({ required: false }), req);
  const result = await creatorInfoNow();
  const res = NextResponse.json({ required: true, demo: tiktokDemo(), ...result });
  res.headers.set("Cache-Control", "no-store");
  return cors(res, req);
}
