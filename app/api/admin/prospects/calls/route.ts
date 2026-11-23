import { NextResponse } from "next/server";
import { parseProspectCall } from "@/lib/team-tasks/prospects";
import { logProspectCall } from "@/lib/team-tasks/prospects-server";
import { readJson, requireViewerCan, respond, serverError } from "../../team-tasks/_shared";

export const dynamic = "force-dynamic";

// POST « Nouvel appel 3D » (migration 111). Capability "prospects.call".
// { prospectId, taskId?, channel?, answeredBy, problemAnswer?, problemWords?,
//   objection?, objectionWords?, interest?, result?, notes? }
// Saves the contact with its number (1, 2, 3...), plans the next step of the
// three-contact sequence and closes the task it was opened from.
export async function POST(req: Request) {
  const viewer = await requireViewerCan("prospects.call");
  if (viewer instanceof NextResponse) return viewer;
  const parsed = parseProspectCall(await readJson(req));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return respond(await logProspectCall(viewer, parsed.value));
  } catch (error) {
    return serverError("POST prospect call", error);
  }
}
