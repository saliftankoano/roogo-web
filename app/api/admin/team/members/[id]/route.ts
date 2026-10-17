import { NextResponse } from "next/server";
import {
  removeMemberAccess,
  requireTeamActor,
  setMemberLevel,
  teamErrorResponse,
} from "@/lib/staff-team-server";

// Change a staff member's level.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireTeamActor();
    if (auth.error) return auth.error;
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    await setMemberLevel(auth.actor, id, body.level, body.reason);
    return NextResponse.json({ success: true });
  } catch (error) {
    return teamErrorResponse(error);
  }
}

// Take all staff access away (a departure, rule 6 of the approved note).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireTeamActor();
    if (auth.error) return auth.error;
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    await removeMemberAccess(auth.actor, id, body.reason);
    return NextResponse.json({ success: true });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
