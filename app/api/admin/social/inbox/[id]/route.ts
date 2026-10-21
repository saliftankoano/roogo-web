import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { isStatusAction } from "@/lib/social/inbox";
import { setItemStatus } from "@/lib/social/inbox-server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// « Marquer comme répondu », « Ignorer », « Remettre à répondre ». The change
// is stored with the staff member who made it.
export async function PATCH(req: Request, { params }: Ctx) {
  const staff = await getStaffOrFounder(req, "social.inbox");
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  if (!isStatusAction(body?.action)) return errorResponse("Action inconnue.", 400, req);
  const result = await setItemStatus(id, staff.id, body.action);
  if (!result.ok) return errorResponse(result.error, result.status, req);
  return NextResponse.json({ item: result.item });
}
