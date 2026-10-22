import { NextResponse } from "next/server";
import { dayKey } from "@/lib/team-tasks/core";
import { parseAbsence } from "@/lib/team-tasks/day-reports";
import { clearAbsence, declareAbsence } from "@/lib/team-tasks/day-reports-server";
import { readJson, requireViewer, respond, serverError } from "../../team-tasks/_shared";

export const dynamic = "force-dynamic";

// POST { userId, date, category, note? }: a Directeur or the Fondateur declares
// someone absent (declared_by records who). { userId, date, clear: true } takes
// it back. Both check isDirectorOrFounder and canDeclareAbsence on the server.
export async function POST(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  try {
    if (body?.clear === true) {
      const parsed = parseAbsence({ ...body, category: "autre", note: null }, dayKey(new Date()));
      if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
      return respond(await clearAbsence(viewer, parsed.value.userId, parsed.value.date));
    }
    const parsed = parseAbsence(body, dayKey(new Date()));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    return respond(await declareAbsence(viewer, parsed.value));
  } catch (error) {
    return serverError("POST absence", error);
  }
}
