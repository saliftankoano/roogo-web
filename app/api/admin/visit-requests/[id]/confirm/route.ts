import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import { confirmVisit, type VisitSlot } from "@/lib/sale-visits";

// Staff confirm one of the buyer's proposed slots. Posts a confirmation card into
// the thread and notifies both parties. Covers staff + founder.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    const body = (await req.json()) as { slot?: unknown };
    const slot = body.slot as VisitSlot | undefined;
    if (!slot || typeof slot.date !== "string" || typeof slot.time !== "string") {
      return NextResponse.json({ error: "A valid slot is required" }, { status: 400 });
    }

    const result = await confirmVisit({
      visitRequestId: id,
      staffId: authResult.supabaseUser.id,
      chosenSlot: { date: slot.date, time: slot.time },
    });

    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({ success: true, scheduledAt: result.scheduledAt });
  } catch (error) {
    console.error("POST /api/admin/visit-requests/[id]/confirm:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
