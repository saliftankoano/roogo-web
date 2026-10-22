import { NextResponse } from "next/server";
import { createInvitation, requireTeamActor, teamErrorResponse } from "@/lib/staff-team-server";

export async function POST(req: Request) {
  try {
    const auth = await requireTeamActor();
    if (auth.error) return auth.error;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await createInvitation(auth.actor, {
      email: body.email,
      level: body.level,
      reason: body.reason,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
