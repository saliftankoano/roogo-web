import { NextResponse } from "next/server";
import { listTeam, requireTeamActor, teamErrorResponse } from "@/lib/staff-team-server";

export const dynamic = "force-dynamic";

// Founder and director: who is on the team, open invitations, the access journal.
export async function GET() {
  try {
    const auth = await requireTeamActor();
    if (auth.error) return auth.error;
    return NextResponse.json({ success: true, ...(await listTeam(auth.actor)) });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
