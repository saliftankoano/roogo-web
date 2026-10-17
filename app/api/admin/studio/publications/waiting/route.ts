import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { roleOf, waitingCount } from "@/lib/studio/publishing-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The founder's badge on Studio and Calendrier: posts waiting for validation.
// Staff get 0, the badge is founder only.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const count = roleOf(staff) === "founder" ? await waitingCount() : 0;
  return cors(NextResponse.json({ count }), req);
}
