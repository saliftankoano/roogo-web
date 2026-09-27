import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { isStaffType, getSaleConversation, resolveRole } from "@/lib/sale-chat";
import {
  getLatestMandateForProperty,
  sendMandate,
  type MandateRow,
} from "@/lib/sale-mandate";
import { DEFAULT_MANDATE_EXCLUSIVITY_DAYS } from "@/lib/sale";
import { saleMandateSendSchema } from "@/lib/validations";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { resolveClerkId } from "@/lib/request-auth";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// What the owner may see of their own mandate: no staff notes and no v3 ladder
// or fee snapshots (they would reveal Roogo's exact listing price and floors).
const SELLER_MANDATE_FIELDS = [
  "id",
  "property_id",
  "seller_id",
  "conversation_id",
  "economics_version",
  "seller_net_price",
  "list_price",
  "desired_price",
  "base_commission_pct",
  "surplus_split_pct",
  "bypass_fee_pct",
  "bypass_months",
  "exclusivity_days",
  "exclusivity_start_at",
  "exclusivity_end_at",
  "status",
  "terms_version",
  "signed_typed_name",
  "sent_at",
  "signed_at",
  "declined_at",
] as const;

function sellerSafeMandate(mandate: MandateRow | null) {
  if (!mandate) return null;
  const source = mandate as unknown as Record<string, unknown>;
  return Object.fromEntries(
    SELLER_MANDATE_FIELDS.map((key) => [key, source[key] ?? null]),
  );
}

// GET: the latest mandate for this conversation's property (seller or staff).
export async function GET(
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
    if (!role) return errorResponse("Forbidden", 403, req);

    // Buyers never see the seller's mandate (it carries the guaranteed net).
    if (role === "user" && conversation.kind !== "seller") {
      return cors(NextResponse.json({ success: true, mandate: null }), req);
    }

    const mandate = await getLatestMandateForProperty(conversation.property_id);
    return cors(
      NextResponse.json({
        success: true,
        mandate: role === "staff" ? mandate : sellerSafeMandate(mandate),
      }),
      req,
    );
  } catch (error) {
    console.error("GET sale-chat mandate:", error);
    return errorResponse("Failed to load mandate", 500, req);
  }
}

// POST: staff sends a mandate to the owner for this conversation's property.
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
    const conversation = await getSaleConversation(id);
    if (!conversation) return errorResponse("Conversation not found", 404, req);

    const payload = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    // Economics v3: the amount is the owner's guaranteed net. Staff app builds
    // released before v3 still post `desiredPrice`; treat it as the net.
    const parsed = saleMandateSendSchema.safeParse({
      sellerNetPrice: payload.sellerNetPrice ?? payload.desiredPrice,
      exclusivityDays:
        Number(payload.exclusivityDays) > 0
          ? Math.round(Number(payload.exclusivityDays))
          : undefined,
      notes: typeof payload.notes === "string" ? payload.notes : null,
    });
    if (!parsed.success) {
      return errorResponse("invalid_price", 400, req);
    }

    const result = await sendMandate({
      propertyId: conversation.property_id,
      staffId: user.id,
      sellerNetPrice: parsed.data.sellerNetPrice,
      exclusivityDays:
        parsed.data.exclusivityDays ?? DEFAULT_MANDATE_EXCLUSIVITY_DAYS,
      notes: parsed.data.notes ?? null,
    });

    if (!result.ok) {
      const status =
        result.reason === "invalid_price" || result.reason === "not_a_sale"
          ? 400
          : 404;
      return errorResponse(result.reason, status, req);
    }

    return cors(NextResponse.json({ success: true, mandate: result.mandate }), req);
  } catch (error) {
    console.error("POST sale-chat mandate:", error);
    return errorResponse("Failed to send mandate", 500, req);
  }
}
