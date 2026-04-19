import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const EVIDENCE_BUCKET = "deposit-evidence";
const EVIDENCE_SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 minutes

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: holdId } = await params;
    if (!holdId) {
      return NextResponse.json({ error: "Missing hold id" }, { status: 400 });
    }

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await currentUser();
    const userType = user?.publicMetadata?.userType;
    if (!["staff", "founder", "admin"].includes(userType as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: hold, error } = await supabaseAdmin
      .from("deposit_holds")
      .select(
        `
        id,
        agreement_id,
        property_id,
        owner_id,
        renter_id,
        amount,
        currency,
        status,
        stay_end_at,
        review_deadline_at,
        resolved_owner_amount,
        resolved_renter_amount,
        resolved_at,
        renter_payout_phone,
        renter_payout_provider,
        metadata,
        created_at,
        properties:property_id (id, quartier, city, address, property_images (url, is_primary)),
        owner:owner_id (id, full_name, phone, email),
        renter:renter_id (id, full_name, phone, email),
        claim:deposit_claims!hold_id (id, claimed_amount, description, status, created_at, resolved_at)
        `,
      )
      .eq("id", holdId)
      .maybeSingle();

    if (error) {
      console.error("Admin dispute detail query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!hold) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    const claimList = Array.isArray(hold.claim) ? hold.claim : [];
    const activeClaim = claimList[0] || null;

    let evidence: {
      id: string;
      storage_path: string;
      signed_url: string | null;
      mime_type: string | null;
      uploaded_at: string;
    }[] = [];

    if (activeClaim) {
      const { data: evidenceRows } = await supabaseAdmin
        .from("deposit_claim_evidence")
        .select("id, storage_path, mime_type, uploaded_at, deleted_at")
        .eq("claim_id", activeClaim.id)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: true });

      if (evidenceRows && evidenceRows.length > 0) {
        evidence = await Promise.all(
          evidenceRows.map(async (row) => {
            const { data: signed } = await supabaseAdmin.storage
              .from(EVIDENCE_BUCKET)
              .createSignedUrl(row.storage_path, EVIDENCE_SIGNED_URL_TTL_SECONDS);
            return {
              id: row.id,
              storage_path: row.storage_path,
              signed_url: signed?.signedUrl || null,
              mime_type: row.mime_type,
              uploaded_at: row.uploaded_at,
            };
          }),
        );
      }
    }

    return NextResponse.json({
      success: true,
      dispute: hold,
      claim: activeClaim,
      evidence,
    });
  } catch (error) {
    console.error("Admin dispute GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
