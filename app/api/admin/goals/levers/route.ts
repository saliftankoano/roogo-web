import { NextResponse } from "next/server";
import { getTeamPeople } from "@/lib/team-tasks/server";
import { isUuidValue, parseLever } from "@/lib/team-goals/core";
import { createLever } from "@/lib/team-goals/server";
import { readJson, requireViewer, respond, serverError } from "../../team-tasks/_shared";

// POST { goalId, ownerId, title, rhythm?, weeklyTarget }: a new lever. Founder only (checked in createLever).
export async function POST(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  if (!isUuidValue(body?.goalId)) return NextResponse.json({ error: "Objectif inconnu." }, { status: 400 });
  const parsed = parseLever(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return respond(await createLever(viewer, await getTeamPeople(viewer), body.goalId, parsed.value));
  } catch (error) {
    return serverError("POST lever", error);
  }
}
