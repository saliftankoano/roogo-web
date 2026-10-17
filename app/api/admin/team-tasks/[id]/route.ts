import { NextResponse } from "next/server";
import { isUuid } from "@/lib/team-tasks/core";
import { deleteTask, updateTask, type TaskAction } from "@/lib/team-tasks/server";
import { readJson, requireViewer, respond, serverError } from "../_shared";

const ACTIONS = new Set(["done", "undo", "postpone", "accept", "reply"]);

// PATCH { action: done | undo | postpone | accept | reply, text? }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Tâche inconnue." }, { status: 400 });
  const body = await readJson(req);
  if (!body || typeof body.action !== "string" || !ACTIONS.has(body.action)) {
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }
  try {
    return respond(await updateTask(viewer, id, body as TaskAction));
  } catch (error) {
    return serverError("PATCH task", error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Tâche inconnue." }, { status: 400 });
  try {
    return respond(await deleteTask(viewer, id));
  } catch (error) {
    return serverError("DELETE task", error);
  }
}
