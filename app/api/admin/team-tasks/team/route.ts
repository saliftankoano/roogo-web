import { NextResponse } from "next/server";
import { getBoardPayload } from "@/lib/team-tasks/server";
import { requireViewer, serverError } from "../_shared";

export const dynamic = "force-dynamic";

// GET: the week board. Directeur and Fondateur only (checked in getBoardPayload).
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    const result = await getBoardPayload(viewer);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, board: result.value });
  } catch (error) {
    return serverError("GET team", error);
  }
}
