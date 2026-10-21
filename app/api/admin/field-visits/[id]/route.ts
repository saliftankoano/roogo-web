import { NextResponse } from "next/server";
import { isUuid } from "@/lib/team-tasks/core";
import { getTeamPeople } from "@/lib/team-tasks/server";
import { parseFiche } from "@/lib/field-visits/core";
import { abandonFiche, getFiche, saveFiche, withdrawFiche } from "@/lib/field-visits/server";
import { readJson, requireViewer, respond, serverError } from "../_shared";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET: one sheet, with its property, files per deliverable and tasks (any staff member, so a
// sheet started on the phone can be continued on a computer).
export async function GET(_req: Request, { params }: Params) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
  try {
    return respond(await getFiche(id));
  } catch (error) {
    return serverError("GET field visit", error);
  }
}

// PUT: autosave of the whole sheet. Creates it on first save with the id the device chose.
export async function PUT(req: Request, { params }: Params) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  const parsed = parseFiche(await readJson(req));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.value.id !== id) return NextResponse.json({ error: "Identifiant de fiche incohérent." }, { status: 400 });
  try {
    return respond(await saveFiche(viewer, parsed.value, await getTeamPeople(viewer)));
  } catch (error) {
    return serverError("PUT field visit", error);
  }
}

// PATCH {action: "abandon"}: "Recommencer une nouvelle fiche". The old sheet is kept, marked abandoned.
// PATCH {action: "withdraw"}: "Retirer cette fiche" (founder only), also for a finished sheet: it and
// its montage tasks leave the follow-up and the briefings. Nothing is deleted.
export async function PATCH(req: Request, { params }: Params) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  const body = await readJson(req);
  const action = body?.action;
  if (!isUuid(id) || (action !== "abandon" && action !== "withdraw")) {
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }
  try {
    return respond(action === "withdraw" ? await withdrawFiche(viewer, id) : await abandonFiche(viewer, id));
  } catch (error) {
    return serverError("PATCH field visit", error);
  }
}
