import { NextResponse } from "next/server";
import { disconnectYouTube } from "@/lib/team-goals/youtube-store";
import { invalidateSocialSnapshot } from "@/lib/social/insights-server";
import { requireFounder } from "../_shared";

// POST: founder only. Revokes the Google grant (best effort) and deletes the
// stored tokens; the YouTube goal goes back to manual readings and the
// Statistiques snapshot is dropped so the YouTube card shows « not connected ».
export async function POST() {
  const viewer = await requireFounder();
  if (viewer instanceof NextResponse) return viewer;
  try {
    await disconnectYouTube();
    invalidateSocialSnapshot();
    return NextResponse.json({ success: true });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[youtube] disconnect failed", { code: e?.code, message: e?.message });
    return NextResponse.json({ error: "La déconnexion a échoué. Réessayez dans un instant." }, { status: 500 });
  }
}
