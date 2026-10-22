import { NextResponse } from "next/server";
import { isUuidValue, parseTarget } from "@/lib/team-goals/core";
import { launchNextGoal } from "@/lib/team-goals/server";
import { readJson, requireViewer, respond, serverError } from "../../../team-tasks/_shared";

// POST { title, target }: « Prochaine marche », « Lancer » or « Ajuster ».
// Founder only (checked in launchNextGoal): creates the next goal with the
// levers copied over, then archives the reached one as a win.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  if (!isUuidValue(id)) return NextResponse.json({ error: "Objectif inconnu." }, { status: 400 });
  const body = await readJson(req);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const target = parseTarget(body?.target);
  if (!title || title.length > 120) return NextResponse.json({ error: "Le titre doit faire de 1 à 120 caractères." }, { status: 400 });
  if (target == null) return NextResponse.json({ error: "La cible doit être un nombre entier positif." }, { status: 400 });
  try {
    return respond(await launchNextGoal(viewer, id, { title, target }));
  } catch (error) {
    return serverError("POST goal next", error);
  }
}
