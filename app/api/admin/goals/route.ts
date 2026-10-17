import { NextResponse } from "next/server";
import { dayKey } from "@/lib/team-tasks/core";
import { getTeamPeople } from "@/lib/team-tasks/server";
import { parseNewGoal } from "@/lib/team-goals/core";
import { createGoal, getGoalsPayload } from "@/lib/team-goals/server";
import { readJson, requireViewer, respond, serverError } from "../team-tasks/_shared";

export const dynamic = "force-dynamic";

// GET: the goals, their levers and their evidence. Everyone on the team reads.
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    const people = await getTeamPeople(viewer);
    return NextResponse.json({ success: true, goals: await getGoalsPayload(viewer, people) });
  } catch (error) {
    return serverError("GET goals", error);
  }
}

// POST { metric, target, period, title?, levers? }: a new goal. Founder only (checked in createGoal).
export async function POST(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsed = parseNewGoal(await readJson(req), dayKey(new Date()));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return respond(await createGoal(viewer, await getTeamPeople(viewer), parsed.value));
  } catch (error) {
    return serverError("POST goal", error);
  }
}
