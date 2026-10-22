import { NextResponse } from "next/server";
import { disconnectTikTok } from "@/lib/team-goals/tiktok-store";
import { invalidateSocialSnapshot } from "@/lib/social/insights-server";
import { requireFounder } from "../_shared";

// POST: founder only. Revokes the TikTok token (best effort) and deletes the
// stored tokens; the TikTok goal goes back to manual readings and the
// Statistiques snapshot is dropped so the TikTok card shows « not connected ».
export async function POST() {
  const viewer = await requireFounder();
  if (viewer instanceof NextResponse) return viewer;
  try {
    await disconnectTikTok();
    invalidateSocialSnapshot();
    return NextResponse.json({ success: true });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[tiktok] disconnect failed", { code: e?.code, message: e?.message });
    return NextResponse.json({ error: "La déconnexion a échoué. Réessayez dans un instant." }, { status: 500 });
  }
}
