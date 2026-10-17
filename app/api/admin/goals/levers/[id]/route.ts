import { NextResponse } from "next/server";
import { getTeamPeople } from "@/lib/team-tasks/server";
import { isUuidValue, parseLever } from "@/lib/team-goals/core";
import { tickLever, updateLever } from "@/lib/team-goals/server";
import { readJson, requireViewer, respond, serverError } from "../../../team-tasks/_shared";

// PATCH { action: tick | untick }: the lever's owner, the Directeur or the founder (canTickLever).
// PATCH { action: edit, ownerId, title, rhythm?, weeklyTarget } | { action: archive }: founder only.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  if (!isUuidValue(id)) return NextResponse.json({ error: "Levier inconnu." }, { status: 400 });
  const body = await readJson(req);
  try {
    if (body?.action === "tick" || body?.action === "untick") return respond(await tickLever(viewer, id, body.action));
    if (body?.action === "archive") return respond(await updateLever(viewer, await getTeamPeople(viewer), id, { archive: true }));
    if (body?.action === "edit") {
      const parsed = parseLever(body);
      if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
      return respond(await updateLever(viewer, await getTeamPeople(viewer), id, parsed.value));
    }
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    return serverError("PATCH lever", error);
  }
}
