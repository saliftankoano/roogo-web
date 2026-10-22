import { NextResponse } from "next/server";
import { isUuid } from "@/lib/team-tasks/core";
import { autoItemAction } from "@/lib/team-tasks/server";
import { readJson, requireViewer, respond, serverError } from "../_shared";

// POST { action: "done", key } ticks an automatic item without its own status.
// POST { action: "assign", key, ownerId } gives an unowned item to someone
// (Directeur and Fondateur only).
export async function POST(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  const action = body?.action;
  const key = typeof body?.key === "string" ? body.key.slice(0, 300) : "";
  if ((action !== "done" && action !== "assign") || !key) {
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }
  if (action === "assign" && !isUuid(body?.ownerId)) {
    return NextResponse.json({ error: "Choisissez à qui l’attribuer." }, { status: 400 });
  }
  try {
    return respond(await autoItemAction(viewer, { action, key, ownerId: body?.ownerId as string | undefined }));
  } catch (error) {
    return serverError("POST auto", error);
  }
}
