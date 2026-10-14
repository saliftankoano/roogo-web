import { NextResponse } from "next/server";
import { parseNewTask, dayKey } from "@/lib/team-tasks/core";
import { createTask, getBriefingPayload, getOpenCount } from "@/lib/team-tasks/server";
import { readJson, requireViewer, respond, serverError } from "./_shared";

export const dynamic = "force-dynamic";

// GET: the caller's briefing, or just the open count with ?view=count (navbar).
export async function GET(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    if (new URL(req.url).searchParams.get("view") === "count") {
      return NextResponse.json({ success: true, open: await getOpenCount(viewer) });
    }
    return NextResponse.json({ success: true, briefing: await getBriefingPayload(viewer) });
  } catch (error) {
    return serverError("GET briefing", error);
  }
}

// POST: a new manual task, or a demande to the founder (Directeur only).
export async function POST(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsed = parseNewTask(await readJson(req), dayKey(new Date()));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return respond(await createTask(viewer, parsed.value));
  } catch (error) {
    return serverError("POST task", error);
  }
}
