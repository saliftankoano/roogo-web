import { NextResponse } from "next/server";
import { getTeamDayReports } from "@/lib/team-tasks/day-reports-server";
import { requireViewer, serverError } from "../../team-tasks/_shared";

export const dynamic = "force-dynamic";

// GET: today's status of everyone, the week's summary and improvement ideas.
// Directeur and Fondateur only (getTeamDayReports checks isDirectorOrFounder);
// absence notes are filtered per viewer by canSeeAbsenceNote.
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    const result = await getTeamDayReports(viewer);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, team: result.value });
  } catch (error) {
    return serverError("GET team day reports", error);
  }
}
