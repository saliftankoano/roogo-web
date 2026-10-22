import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { fcfaPerUsd } from "@/lib/studio/currency";
import {
  getMonthlyCapUsd,
  getUsedThisMonthUsd,
  getVideoCapUsd,
  getVideoUsedThisMonthUsd,
} from "@/lib/studio/server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The person's own Studio budget for the current month: cap, spent, left.
// Read-only; shown in the Studio header so the limit is never a surprise.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const [capUsd, usedUsd, videoCapUsd, videoUsedUsd] = await Promise.all([
    getMonthlyCapUsd(staff.id),
    getUsedThisMonthUsd(staff.id),
    getVideoCapUsd(staff.id),
    getVideoUsedThisMonthUsd(staff.id),
  ]);

  return cors(
    NextResponse.json({
      capUsd,
      usedUsd,
      remainingUsd: Math.max(0, capUsd - usedUsd),
      // Videos (HeyGen) have their own pot, separate from voices and images (fal, Cartesia).
      video: { capUsd: videoCapUsd, usedUsd: videoUsedUsd, remainingUsd: Math.max(0, videoCapUsd - videoUsedUsd) },
      fcfaPerUsd: fcfaPerUsd(process.env.STUDIO_FCFA_PER_USD),
    }),
    req,
  );
}
