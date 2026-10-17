import { NextResponse } from "next/server";
import { isUuid, parseCallNote } from "@/lib/team-tasks/core";
import { getCallContext, getCallLog, saveCallNote } from "@/lib/team-tasks/calls-server";
import { readJson, requireViewer, respond, serverError } from "../team-tasks/_shared";

export const dynamic = "force-dynamic";

// GET ?taskId=: the « Appeler et noter » panel of one call task (its owner,
//   its creator, the Directeur or the founder), with the previous calls the
//   viewer may see (author, Directeur, founder).
// GET ?view=log: « Notes d’appels », Directeur and founder only.
export async function GET(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { searchParams } = new URL(req.url);
  try {
    if (searchParams.get("view") === "log") {
      const result = await getCallLog(viewer);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ success: true, log: result.value });
    }
    const taskId = searchParams.get("taskId");
    if (!isUuid(taskId)) return NextResponse.json({ error: "Tâche inconnue." }, { status: 400 });
    const result = await getCallContext(viewer, taskId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, call: result.value });
  } catch (error) {
    return serverError("GET call notes", error);
  }
}

// POST { taskId, outcome, notes?, nextStep, nextDate?, nextTime? }: saves the
// note, creates the next step's task and closes the call task.
export async function POST(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsed = parseCallNote(await readJson(req), new Date());
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return respond(await saveCallNote(viewer, parsed.value));
  } catch (error) {
    return serverError("POST call note", error);
  }
}
