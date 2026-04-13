import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * GET /api/rent-payments/receipt/:transactionId
 * Returns the data needed to generate a receipt for a rent payment.
 * The mobile client uses this data with expo-print to render the PDF locally.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await params;

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    // Fetch transaction
    const { data: transaction, error: txError } = await supabaseAdmin
      .from("transactions")
      .select("id, deposit_id, amount, currency, status, created_at, provider, metadata, property_id, user_id")
      .eq("id", transactionId)
      .single();

    if (txError || !transaction) {
      // Try by deposit_id
      const { data: txByDeposit, error: depositError } = await supabaseAdmin
        .from("transactions")
        .select("id, deposit_id, amount, currency, status, created_at, provider, metadata, property_id, user_id")
        .eq("deposit_id", transactionId)
        .single();

      if (depositError || !txByDeposit) {
        return errorResponse("Transaction not found", 404, req);
      }

      if (txByDeposit.user_id !== user.id) {
        return errorResponse("Forbidden", 403, req);
      }

      return buildReceiptResponse(txByDeposit, req);
    }

    if (transaction.user_id !== user.id) {
      return errorResponse("Forbidden", 403, req);
    }

    return buildReceiptResponse(transaction, req);
  } catch (error) {
    console.error("Error in GET /api/rent-payments/receipt/[transactionId]:", error);
    return errorResponse("Internal server error", 500, req);
  }
}

async function buildReceiptResponse(
  transaction: {
    id: string;
    deposit_id: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
    provider: string;
    metadata: unknown;
    property_id: string | null;
    user_id: string;
  },
  req: Request
) {
  const meta = (transaction.metadata || {}) as Record<string, unknown>;
  const scheduleId = meta?.scheduleId as string | undefined;

  let schedule = null;
  let property = null;
  let renter = null;
  let owner = null;

  if (scheduleId) {
    const { data: scheduleData } = await supabaseAdmin
      .from("rent_schedules")
      .select("*, properties(id, address, quartier, ville), owner:users!rent_schedules_owner_id_fkey(id, full_name, phone)")
      .eq("id", scheduleId)
      .single();
    schedule = scheduleData;
    if (schedule) {
      property = (schedule as Record<string, unknown>).properties as { address: string; quartier?: string } | null;
      owner = (schedule as Record<string, unknown>).owner as { full_name: string } | null;
    }
  } else if (transaction.property_id) {
    const { data: propertyData } = await supabaseAdmin
      .from("properties")
      .select("id, address, quartier, agent_id")
      .eq("id", transaction.property_id)
      .single();
    property = propertyData;
  }

  const { data: renterData } = await supabaseAdmin
    .from("users")
    .select("id, full_name, phone")
    .eq("id", transaction.user_id)
    .single();
  renter = renterData;

  return cors(
    NextResponse.json({
      receipt: {
        transactionId: transaction.id,
        depositId: transaction.deposit_id,
        amount: transaction.amount,
        currency: transaction.currency || "XOF",
        status: transaction.status,
        paidAt: transaction.created_at,
        provider: transaction.provider,
        schedule,
        property,
        renter,
        owner,
      },
    }),
    req
  );
}
