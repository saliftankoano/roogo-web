import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";

const MAX_PHOTOS_PER_CLAIM = 6;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(
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
      claimedAmount?: unknown;
      description?: unknown;
      evidencePaths?: unknown;
    };
    const claimedAmount = Math.round(Number(body.claimedAmount) || 0);
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const evidencePaths = Array.isArray(body.evidencePaths)
      ? body.evidencePaths.filter(
          (p): p is string => typeof p === "string" && p.length > 0,
        )
      : [];

    if (claimedAmount <= 0) {
      return errorResponse("Montant de la réclamation invalide", 400, req);
    }
    if (description.length < 10) {
      return errorResponse(
        "Veuillez décrire le dommage (au moins 10 caractères)",
        400,
        req,
      );
    }
    if (evidencePaths.length === 0) {
      return errorResponse(
        "Ajoutez au moins une photo justificative",
        400,
        req,
      );
    }
    if (evidencePaths.length > MAX_PHOTOS_PER_CLAIM) {
      return errorResponse(
        `Maximum ${MAX_PHOTOS_PER_CLAIM} photos par réclamation`,
        400,
        req,
      );
    }

    const { data: hold, error: holdError } = await supabaseAdmin
      .from("deposit_holds")
      .select("id, owner_id, renter_id, amount, status")
      .eq("id", holdId)
      .maybeSingle();

    if (holdError) {
      console.error("Error loading hold for claim:", holdError);
      return errorResponse("Failed to load deposit hold", 500, req);
    }
    if (!hold) return errorResponse("Deposit hold not found", 404, req);
    if (hold.owner_id !== user.id) return errorResponse("Forbidden", 403, req);
    if (hold.status !== "held") {
      return errorResponse(
        "Cette caution ne peut plus recevoir de réclamation",
        409,
        req,
      );
    }
    if (claimedAmount > hold.amount) {
      return errorResponse(
        `Le montant réclamé ne peut pas dépasser la caution (${hold.amount} XOF)`,
        400,
        req,
      );
    }

    // Atomic transition held -> disputed. Loser of the race gets a 409.
    const { data: transitioned, error: transitionError } = await supabaseAdmin
      .from("deposit_holds")
      .update({ status: "disputed" })
      .eq("id", holdId)
      .eq("status", "held")
      .select("id")
      .maybeSingle();

    if (transitionError) {
      console.error("Error transitioning hold to disputed:", transitionError);
      return errorResponse("Failed to submit claim", 500, req);
    }
    if (!transitioned) {
      return errorResponse(
        "Cette caution n'est plus éligible à une réclamation",
        409,
        req,
      );
    }

    const { data: claim, error: claimError } = await supabaseAdmin
      .from("deposit_claims")
      .insert({
        hold_id: holdId,
        owner_id: user.id,
        claimed_amount: claimedAmount,
        description,
        status: "submitted",
      })
      .select("id")
      .single();

    if (claimError || !claim) {
      console.error("Error inserting deposit claim:", claimError);
      // Roll back the hold transition so the owner can retry.
      await supabaseAdmin
        .from("deposit_holds")
        .update({ status: "held" })
        .eq("id", holdId);
      return errorResponse("Failed to record claim", 500, req);
    }

    const evidenceRows = evidencePaths.map((storagePath) => ({
      claim_id: claim.id,
      storage_path: storagePath,
      mime_type: "image/jpeg",
    }));

    const { error: evidenceError } = await supabaseAdmin
      .from("deposit_claim_evidence")
      .insert(evidenceRows);

    if (evidenceError) {
      console.error("Error inserting evidence rows:", evidenceError);
      // Claim itself is inserted; leave it submitted but warn.
      return errorResponse(
        "Réclamation enregistrée mais certaines photos n'ont pas été liées",
        500,
        req,
      );
    }

    try {
      await notifyUserWithTemplate(
        hold.renter_id,
        "payments",
        "deposits.claimFiled",
        undefined,
        { holdId, claimId: claim.id, type: "deposit_claim_filed" },
      );
    } catch (err) {
      console.error("Claim notify failed:", err);
    }

    return cors(
      NextResponse.json({
        success: true,
        claimId: claim.id,
        status: "disputed",
      }),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/deposit-holds/[id]/claim:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
