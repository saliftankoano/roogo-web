import { NextResponse } from "next/server";
import { isUuid } from "@/lib/team-tasks/core";
import { TASK_KEYS, type TaskKey } from "@/lib/field-visits/core";
import { completeFiche } from "@/lib/field-visits/server";
import { readJson, requireViewer, respond, serverError } from "../../_shared";

export const dynamic = "force-dynamic";

// POST {owners: {t1: userId, ...}}: "Envoyer la fiche à l’équipe". Creates the six
// tasks once (finishing twice creates nothing new) and closes the sheet.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
  const body = await readJson(req);
  const owners: Partial<Record<TaskKey, string>> = {};
  const raw = body?.owners && typeof body.owners === "object" ? (body.owners as Record<string, unknown>) : {};
  for (const key of TASK_KEYS) if (isUuid(raw[key])) owners[key] = raw[key] as string;
  try {
    return respond(await completeFiche(viewer, id, owners));
  } catch (error) {
    return serverError("POST complete", error);
  }
}
