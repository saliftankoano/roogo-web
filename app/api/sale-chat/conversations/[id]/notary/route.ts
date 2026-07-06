import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { isStaffType } from "@/lib/sale-chat";
import { scheduleNotaryMeeting } from "@/lib/notary-meetings";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { resolveClerkId } from "@/lib/request-auth";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// POST: staff schedules a notary meeting at the Roogo office for a buyer conversation.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!isStaffType(user.user_type))
      return errorResponse("Forbidden", 403, req);

    const { id } = await params;
    const payload = (await req.json()) as {
      scheduledAt?: unknown;
      notaryName?: unknown;
      notes?: unknown;
    };
    const scheduledAt =
      typeof payload.scheduledAt === "string" ? payload.scheduledAt : "";
    if (!scheduledAt) return errorResponse("scheduledAt is required", 400, req);

    const result = await scheduleNotaryMeeting({
      conversationId: id,
      staffId: user.id,
      scheduledAt,
      notaryName:
        typeof payload.notaryName === "string" ? payload.notaryName : null,
      notes: typeof payload.notes === "string" ? payload.notes : null,
    });

    if (!result.ok) {
      const status =
        result.reason === "not_a_buyer_thread" ||
        result.reason === "invalid_date"
          ? 400
          : 404;
      return errorResponse(result.reason, status, req);
    }

    return cors(
      NextResponse.json({ success: true, meetingId: result.meetingId }),
      req,
    );
  } catch (error) {
    console.error("POST sale-chat notary:", error);
    return errorResponse("Failed to schedule notary meeting", 500, req);
  }
}
