import { NextResponse } from "next/server";
import { isUuid } from "@/lib/team-tasks/core";
import { parseProspect, phoneDigits } from "@/lib/team-tasks/prospects";
import { createProspect, getProspectHistory, listProspects, prospectsWithPhone } from "@/lib/team-tasks/prospects-server";
import { readJson, requireViewerCan, respond, serverError } from "../team-tasks/_shared";

export const dynamic = "force-dynamic";

// Visites 3D businesses (migration 111). Capability "prospects.call".
// GET ?q=        the businesses the viewer added or called (everyone's for the
//                Directeur and the founder), filtered by name.
// GET ?phone=    businesses already saved with that number (PRD 1.3).
// GET ?id=       one business with its calls in order (PRD 1.6); a caller
//                reads only their own calls, Directeur and founder all.
export async function GET(req: Request) {
  const viewer = await requireViewerCan("prospects.call");
  if (viewer instanceof NextResponse) return viewer;
  const { searchParams } = new URL(req.url);
  try {
    const id = searchParams.get("id");
    if (id !== null) {
      if (!isUuid(id)) return NextResponse.json({ error: "Entreprise inconnue." }, { status: 400 });
      const result = await getProspectHistory(viewer, id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ success: true, history: result.value });
    }
    const phone = searchParams.get("phone");
    if (phone !== null) {
      const digits = phoneDigits(phone);
      if (!digits) return NextResponse.json({ success: true, matches: [] });
      const result = await prospectsWithPhone(viewer, digits);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ success: true, matches: result.value });
    }
    const result = await listProspects(viewer, searchParams.get("q") ?? "");
    return respond(result);
  } catch (error) {
    return serverError("GET prospects", error);
  }
}

// POST { name, kind, phone?, quartier?, city?, mapsUrl?, force? }: adds a
// business. 409 when the number is already saved, unless force is true.
export async function POST(req: Request) {
  const viewer = await requireViewerCan("prospects.call");
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  const parsed = parseProspect(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return respond(await createProspect(viewer, parsed.value, body?.force === true));
  } catch (error) {
    return serverError("POST prospect", error);
  }
}
