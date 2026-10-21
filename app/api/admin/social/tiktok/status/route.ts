import { NextResponse } from "next/server";
import { getTikTokStatus } from "@/lib/team-goals/tiktok-store";
import { requireFounder } from "../_shared";

// GET: founder only. Whether TikTok is set up and connected, for the card on
// « Nos objectifs ». No token ever leaves the server.
export async function GET() {
  const viewer = await requireFounder();
  if (viewer instanceof NextResponse) return viewer;
  try {
    return NextResponse.json(await getTikTokStatus());
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[tiktok] status failed", { code: e?.code, message: e?.message });
    return NextResponse.json({ error: "Le statut TikTok n’a pas pu se charger." }, { status: 500 });
  }
}
