// Hook between the field visit sheet and the Studio publishing calendar.
//
// When a sheet is sent ("Tournage terminé"), its planned publication dates
// (J+1 presentation, J+2 marche, J+4 carrousel + 3D link, J+5 3D video with
// music, in business days) are stored on field_visits.deliverable_dates and
// passed here. The publishing calendar lives on the branch
// feat/studio-publishing-calendar, which is not merged, so this does nothing
// yet. When that branch merges: create one draft publication per entry (all
// waiting for Salif's validation), then set field_visits.publications_created_at
// so it runs once per sheet.

import type { PlannedPublication } from "./core";

export type PublicationHookResult = { created: number; reason: string | null };

export async function createCalendarPublications(
  visitId: string,
  publications: PlannedPublication[],
): Promise<PublicationHookResult> {
  void visitId;
  void publications;
  return { created: 0, reason: "Le calendrier de publication du Studio n’est pas encore branché." };
}
