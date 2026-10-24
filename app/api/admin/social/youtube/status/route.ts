import { NextResponse } from "next/server";
import { getYouTubeStatus } from "@/lib/team-goals/youtube-store";
import { requireFounder } from "../_shared";

// GET: founder only. Whether YouTube is set up and connected, for the YouTube
// card of Studio > Statistiques. No token ever leaves the server.
export async function GET() {
  const viewer = await requireFounder();
  if (viewer instanceof NextResponse) return viewer;
  try {
    return NextResponse.json(await getYouTubeStatus());
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[youtube] status failed", { code: e?.code, message: e?.message });
    return NextResponse.json({ error: "Le statut YouTube n’a pas pu se charger." }, { status: 500 });
  }
}
