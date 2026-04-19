import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import {
  normalizeBurkinaPhone,
  normalizePawaPayProvider,
} from "@/lib/owner-wallet";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: holdId } = await params;
    if (!holdId) return errorResponse("Missing hold id", 400, req);

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const body = (await req.json()) as {
      payoutPhone?: unknown;
      payoutProvider?: unknown;
    };

    const payoutPhone =
      typeof body.payoutPhone === "string"
        ? normalizeBurkinaPhone(body.payoutPhone)
        : null;
    const payoutProvider =
      typeof body.payoutProvider === "string"
        ? normalizePawaPayProvider(body.payoutProvider)
        : null;

    if (!payoutPhone) {
      return errorResponse("Numéro de remboursement invalide", 400, req);
    }
    if (!payoutProvider) {
      return errorResponse("Opérateur de remboursement invalide", 400, req);
    }

    const { data: hold, error: holdError } = await supabaseAdmin
      .from("deposit_holds")
      .select("id, renter_id, status")
      .eq("id", holdId)
      .maybeSingle();

    if (holdError) {
      console.error("Error loading hold for payout-phone update:", holdError);
      return errorResponse("Failed to load deposit hold", 500, req);
    }
    if (!hold) return errorResponse("Deposit hold not found", 404, req);
    if (hold.renter_id !== user.id) return errorResponse("Forbidden", 403, req);
    if (hold.status !== "held") {
      return errorResponse(
        "Le numéro ne peut être modifié que pendant la période de garde",
        409,
        req,
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("deposit_holds")
      .update({
        renter_payout_phone: payoutPhone,
        renter_payout_provider: payoutProvider,
      })
      .eq("id", holdId)
      .eq("status", "held");

    if (updateError) {
      console.error("Error updating hold payout phone:", updateError);
      return errorResponse("Failed to update payout info", 500, req);
    }

    return cors(
      NextResponse.json({
        success: true,
        payoutPhone,
        payoutProvider,
      }),
      req,
    );
  } catch (error) {
    console.error("Error in PATCH /api/deposit-holds/[id]/payout-phone:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
