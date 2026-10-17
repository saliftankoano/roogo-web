import { NextResponse } from "next/server";
import { isDirectorOrFounder, isUuid } from "@/lib/team-tasks/core";
import { getTeamPeople } from "@/lib/team-tasks/server";
import { getStart, listSuivi } from "@/lib/field-visits/server";
import { requireViewer, respond, serverError } from "./_shared";

export const dynamic = "force-dynamic";

// GET ?propertyId=<uuid>   start screen: the listing, the team, an unfinished sheet for it.
// GET ?view=suivi          follow-up list (Directeur and Fondateur only).
export async function GET(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { searchParams } = new URL(req.url);
  try {
    const people = await getTeamPeople(viewer);
    if (searchParams.get("view") === "suivi") {
      if (!isDirectorOrFounder(viewer.level)) {
        return NextResponse.json({ error: "Réservé au Directeur et au Fondateur." }, { status: 403 });
      }
      return respond(await listSuivi(people));
    }
    const propertyId = searchParams.get("propertyId");
    if (!isUuid(propertyId)) return NextResponse.json({ error: "Bien manquant." }, { status: 400 });
    return respond(await getStart(viewer, propertyId, people));
  } catch (error) {
    return serverError("GET field visits", error);
  }
}
