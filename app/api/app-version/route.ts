import { NextRequest, NextResponse } from "next/server";
import { cors, corsOptions } from "@/lib/api-helpers";

// Latest version LIVE in each store, bumped manually as the final step of the
// release checklist (roogo/docs/PRODUCTION_BUILD_CHECKLIST.md) once a store
// approves the build. Do NOT bump at submission time: prompting users toward a
// store page that still serves the old binary is worse than no prompt.
const LATEST = {
  ios: {
    version: "1.16.0",
    url: "https://apps.apple.com/app/roogo-burkina/id6761714300",
  },
  android: {
    version: "1.16.0",
    url: "https://play.google.com/store/apps/details?id=com.kazedra.roogo",
  },
};

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

export async function GET(req: NextRequest) {
  return cors(
    NextResponse.json(LATEST, {
      headers: { "Cache-Control": "public, s-maxage=300, max-age=300" },
    }),
    req,
  );
}
