import { NextResponse } from "next/server";
import { isUuid } from "@/lib/team-tasks/core";
import { parseDailyTarget } from "@/lib/team-tasks/prospects";
import { getCallGoals, setCallGoal } from "@/lib/team-tasks/prospects-server";
import { readJson, requireViewerCan, respond, serverError } from "../team-tasks/_shared";

export const dynamic = "force-dynamic";

// GET: today's and this week's logged calls against the daily goal
// (capability "prospects.call"). A caller gets their own numbers; the
// Directeur and the founder also get everyone's (`team`).
export async function GET() {
  const viewer = await requireViewerCan("prospects.call");
  if (viewer instanceof NextResponse) return viewer;
  try {
    const result = await getCallGoals(viewer);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, goals: result.value });
  } catch (error) {
    return serverError("GET call goals", error);
  }
}

// PUT { userId, dailyTarget | null }: sets, changes or removes a daily call
// goal. Founder only (capability "callGoals.manage"); every change is logged.
export async function PUT(req: Request) {
  const viewer = await requireViewerCan("callGoals.manage");
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  if (!isUuid(body?.userId)) return NextResponse.json({ error: "Choisissez la personne." }, { status: 400 });
  const target = parseDailyTarget(body?.dailyTarget);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: 400 });
  try {
    return respond(await setCallGoal(viewer, body.userId as string, target.value));
  } catch (error) {
    return serverError("PUT call goal", error);
  }
}
