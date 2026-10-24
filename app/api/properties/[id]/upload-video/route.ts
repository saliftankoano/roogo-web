import { cors, corsOptions } from "@/lib/api-helpers";
import { NextResponse } from "next/server";

// Listing videos were removed on 2026-10-24 (Salif): the 3D tour is the
// immersive format, and videos were never stored (no property_videos table in
// production). Older app builds may still call this route; answer clearly.
export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST() {
  return cors(
    NextResponse.json(
      { error: "La vidéo n'est plus acceptée sur les annonces." },
      { status: 410 },
    ),
  );
}
