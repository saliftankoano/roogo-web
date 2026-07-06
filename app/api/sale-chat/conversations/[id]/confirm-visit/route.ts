import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { isStaffType } from "@/lib/sale-chat";
import { confirmVisit } from "@/lib/sale-visits";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { resolveClerkId } from "@/lib/request-auth";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// POST: staff confirms one of the buyer's proposed visit slots, from the thread.
export async function POST(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!isStaffType(user.user_type))
      return errorResponse("Forbidden", 403, req);

    const payload = (await req.json()) as {
      visitRequestId?: unknown;
      slot?: { date?: unknown; time?: unknown };
    };
    const visitRequestId =
      typeof payload.visitRequestId === "string" ? payload.visitRequestId : "";
    const date =
      typeof payload.slot?.date === "string" ? payload.slot.date : "";
    const time =
      typeof payload.slot?.time === "string" ? payload.slot.time : "";
    if (!visitRequestId || !date || !time)
      return errorResponse("visitRequestId and slot are required", 400, req);

    const result = await confirmVisit({
      visitRequestId,
      staffId: user.id,
      chosenSlot: { date, time },
    });

    if (!result.ok) {
      const status = result.reason === "already_handled" ? 409 : 404;
      return errorResponse(result.reason, status, req);
    }

    return cors(
      NextResponse.json({ success: true, scheduledAt: result.scheduledAt }),
      req,
    );
  } catch (error) {
    console.error("POST sale-chat confirm-visit:", error);
    return errorResponse("Failed to confirm visit", 500, req);
  }
}
