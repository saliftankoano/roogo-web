import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { maybeCompleteDailyBooking } from "@/lib/daily-bookings";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing issue id" }, { status: 400 });

    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const clerkUser = await currentUser();
    const userType = clerkUser?.publicMetadata?.userType;
    if (!["staff", "founder", "admin"].includes(userType as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const staffUser = await getOrSyncUserByClerkId(userId);
    if (!staffUser) {
      return NextResponse.json({ error: "Staff user not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      resolutionNote?: unknown;
      outcome?: unknown;
    };
    const resolutionNote =
      typeof body.resolutionNote === "string"
        ? body.resolutionNote.trim()
        : null;
    const status = body.outcome === "dismissed" ? "dismissed" : "resolved";

    const { data: issue, error: issueError } = await supabaseAdmin
      .from("daily_booking_issues")
      .select("id, booking_request_id, status")
      .eq("id", id)
      .maybeSingle();

    if (issueError) {
      console.error("Daily issue resolve load error:", issueError);
      return NextResponse.json({ error: "Failed to load issue" }, { status: 500 });
    }
    if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    if (issue.status !== "open") {
      return NextResponse.json({ error: "Issue is already closed" }, { status: 409 });
    }

    const resolvedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("daily_booking_issues")
      .update({
        status,
        resolution_note: resolutionNote,
        resolved_by: staffUser.id,
        resolved_at: resolvedAt,
      })
      .eq("id", id)
      .eq("status", "open");

    if (updateError) {
      console.error("Daily issue resolve update error:", updateError);
      return NextResponse.json({ error: "Failed to resolve issue" }, { status: 500 });
    }

    const completion = await maybeCompleteDailyBooking(issue.booking_request_id);

    return NextResponse.json({
      success: true,
      status,
      completion,
    });
  } catch (error) {
    console.error("Daily issue resolve POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
