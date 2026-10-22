import { NextResponse } from "next/server";
import { isUuidValue, parseTarget } from "@/lib/team-goals/core";
import { updateGoal, type GoalPatch } from "@/lib/team-goals/server";
import { readJson, requireViewer, respond, serverError } from "../../team-tasks/_shared";

// PATCH { action: target, target } (the title follows the new target when it carries the old one)
//     | { action: title, title } | { action: edit, title, target } | { action: archive } | { action: restore }
// Founder only (checked in updateGoal). archive is « Retirer l’objectif », restore is « Annuler ».
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  if (!isUuidValue(id)) return NextResponse.json({ error: "Objectif inconnu." }, { status: 400 });
  const body = await readJson(req);
  let patch: GoalPatch;
  if (body?.action === "target") {
    const target = parseTarget(body.target);
    if (target == null) return NextResponse.json({ error: "La cible doit être un nombre entier positif." }, { status: 400 });
    patch = { action: "target", target };
  } else if (body?.action === "title") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 120) return NextResponse.json({ error: "Le titre doit faire de 1 à 120 caractères." }, { status: 400 });
    patch = { action: "title", title };
  } else if (body?.action === "edit") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const target = parseTarget(body.target);
    if (!title || title.length > 120) return NextResponse.json({ error: "Le titre doit faire de 1 à 120 caractères." }, { status: 400 });
    if (target == null) return NextResponse.json({ error: "La cible doit être un nombre entier positif." }, { status: 400 });
    patch = { action: "edit", title, target };
  } else if (body?.action === "archive" || body?.action === "restore") {
    patch = { action: body.action };
  } else {
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }
  try {
    return respond(await updateGoal(viewer, id, patch));
  } catch (error) {
    return serverError("PATCH goal", error);
  }
}
