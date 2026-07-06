import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getSaleConversation, resolveRole } from "@/lib/sale-chat";
import { signMandate } from "@/lib/sale-mandate";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { resolveClerkId } from "@/lib/request-auth";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// POST: the owner signs the mandate for this seller conversation.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const { id } = await params;
    const conversation = await getSaleConversation(id);
    if (!conversation) return errorResponse("Conversation not found", 404, req);

    const role = resolveRole(conversation, {
      id: user.id,
      user_type: user.user_type,
    });
    // Only the owner (the seller thread's user) can sign.
    if (role !== "user" || conversation.kind !== "seller") {
      return errorResponse("Only the owner can sign the mandate", 403, req);
    }

    const payload = (await req.json()) as {
      mandateId?: unknown;
      typedName?: unknown;
    };
    const mandateId =
      typeof payload.mandateId === "string" ? payload.mandateId : "";
    const typedName =
      typeof payload.typedName === "string" ? payload.typedName.trim() : "";
    if (!mandateId) return errorResponse("mandateId is required", 400, req);
    if (!typedName)
      return errorResponse("Signez avec votre nom complet", 400, req);

    const result = await signMandate({
      mandateId,
      sellerId: user.id,
      typedName,
      signatureMeta: { signed_via: "in_app" },
    });

    if (!result.ok) {
      const status =
        result.reason === "forbidden"
          ? 403
          : result.reason === "already_handled"
            ? 409
            : 404;
      return errorResponse(result.reason, status, req);
    }

    return cors(
      NextResponse.json({ success: true, listPrice: result.listPrice }),
      req,
    );
  } catch (error) {
    console.error("POST sale-chat mandate sign:", error);
    return errorResponse("Failed to sign mandate", 500, req);
  }
}
