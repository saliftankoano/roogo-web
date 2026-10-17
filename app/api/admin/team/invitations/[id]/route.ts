import { NextResponse } from "next/server";
import { requireTeamActor, revokeInvitation, teamErrorResponse } from "@/lib/staff-team-server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireTeamActor();
    if (auth.error) return auth.error;
    const { id } = await params;
    await revokeInvitation(auth.actor, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
