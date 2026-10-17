import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { addDays, suggestSlots } from "@/lib/studio/publishing";
import { loadPropertyRow, propertyLabels } from "@/lib/studio/conversations-server";
import { toPropertySummary } from "@/lib/studio/property-context";
import {
  lastVisitDate,
  loadArtifactInfo,
  metaStatus,
  publicationForArtifact,
  publishSlots,
  roleOf,
  takenSlots,
  toDtos,
} from "@/lib/studio/publishing-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The video card of a Studio project: its publication (if any) and the slot
// list of "Planifier la publication".
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const artifactId = new URL(req.url).searchParams.get("artifactId") ?? "";
  if (!artifactId) return errorResponse("Vidéo manquante", 400, req);
  const artifact = await loadArtifactInfo(artifactId);
  if (!artifact || artifact.kind !== "video") return errorResponse("Vidéo introuvable", 404, req);

  const { row, cadence } = await publicationForArtifact(artifact.id, artifact.property_id);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [visitDate, taken, property] = await Promise.all([
    cadence?.visit_date ?? lastVisitDate(artifact.property_id),
    takenSlots(`${today}T00:00:00.000Z`, `${addDays(today, 21)}T00:00:00.000Z`, [row?.id, cadence?.id].filter((id): id is string => Boolean(id))),
    artifact.property_id ? loadPropertyRow(artifact.property_id) : Promise.resolve(null),
  ]);
  const summary = property ? toPropertySummary(property, propertyLabels) : null;
  const slots = suggestSlots({ now, slots: publishSlots(), visitDate, place: summary?.place ?? null, taken, count: 4 });
  const [publication] = row ? await toDtos([row]) : [null];

  return cors(
    NextResponse.json({
      publication,
      cadenceId: cadence?.id ?? null,
      slots,
      daySlots: publishSlots(),
      meta: metaStatus(),
      me: { id: staff.id, role: roleOf(staff) },
    }),
    req,
  );
}
