import { NextResponse } from "next/server";
import { parseDayReport } from "@/lib/team-tasks/day-reports";
import { getMyDayReport, submitMyReport } from "@/lib/team-tasks/day-reports-server";
import { readJson, requireViewer, respond, serverError } from "../team-tasks/_shared";

export const dynamic = "force-dynamic";

// GET: the caller's own « Fin de journée » for today (any staff level).
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    return NextResponse.json({ success: true, report: await getMyDayReport(viewer) });
  } catch (error) {
    return serverError("GET day report", error);
  }
}

// POST: send or edit (same day, from 15:00) the caller's own report. Each line
// of « Mes actions pour demain » becomes a task for the caller, due tomorrow.
// A person only ever writes their own report: the user id comes from the session.
export async function POST(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsed = parseDayReport(await readJson(req));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return respond(await submitMyReport(viewer, parsed.value));
  } catch (error) {
    return serverError("POST day report", error);
  }
}
