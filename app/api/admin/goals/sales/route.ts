import { NextResponse } from "next/server";
import { dayKey } from "@/lib/team-tasks/core";
import { isUuidValue, parseSale } from "@/lib/team-goals/core";
import { confirmSale, removeSale } from "@/lib/team-goals/server";
import { readJson, requireViewer, respond, serverError } from "../../team-tasks/_shared";

// POST { propertyId, signedOn, note? }: the founder confirms a sale signed at the notary.
// DELETE ?id=: the founder takes a confirmation back. Founder only (checked in the server).
export async function POST(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsed = parseSale(await readJson(req), dayKey(new Date()));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return respond(await confirmSale(viewer, parsed.value));
  } catch (error) {
    return serverError("POST sale", error);
  }
}

export async function DELETE(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuidValue(id)) return NextResponse.json({ error: "Vente inconnue." }, { status: 400 });
  try {
    return respond(await removeSale(viewer, id));
  } catch (error) {
    return serverError("DELETE sale", error);
  }
}
