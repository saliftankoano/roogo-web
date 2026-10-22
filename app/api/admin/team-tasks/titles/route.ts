import { NextResponse } from "next/server";
import { isStaffTitle, isUuid } from "@/lib/team-tasks/core";
import { setStaffTitle } from "@/lib/team-tasks/server";
import { readJson, requireViewer, respond, serverError } from "../_shared";

// PUT { userId, title }: founder only (checked in setStaffTitle).
export async function PUT(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  if (!isUuid(body?.userId) || !isStaffTitle(body?.title)) {
    return NextResponse.json({ error: "Titre inconnu." }, { status: 400 });
  }
  try {
    return respond(await setStaffTitle(viewer, body.userId, body.title));
  } catch (error) {
    return serverError("PUT title", error);
  }
}
