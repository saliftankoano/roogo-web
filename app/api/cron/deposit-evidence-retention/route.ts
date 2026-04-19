import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const EVIDENCE_BUCKET = "deposit-evidence";
const RETENTION_DAYS = 7;
const BATCH_LIMIT = 200;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoffIso = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Find evidence rows tied to holds resolved >= RETENTION_DAYS ago. Using
    // a nested select keeps the join server-side. We then filter rows whose
    // hold already has a resolved_at older than the cutoff.
    const { data: evidenceRows, error } = await supabaseAdmin
      .from("deposit_claim_evidence")
      .select(
        `
        id,
        storage_path,
        claim:deposit_claims!claim_id (
          id,
          hold:deposit_holds!hold_id (id, resolved_at, status)
        )
        `,
      )
      .is("deleted_at", null)
      .limit(BATCH_LIMIT);

    if (error) {
      console.error("Evidence retention query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type HoldRef = {
      id: string;
      resolved_at: string | null;
      status: string;
    };
    type ClaimRef = { id: string; hold: HoldRef | HoldRef[] | null };
    type Row = {
      id: string;
      storage_path: string;
      claim: ClaimRef | ClaimRef[] | null;
    };

    const firstOrNull = <T,>(v: T | T[] | null | undefined): T | null => {
      if (!v) return null;
      return Array.isArray(v) ? v[0] || null : v;
    };

    const stale = ((evidenceRows as Row[] | null) || []).filter((row) => {
      const claim = firstOrNull(row.claim);
      const hold = firstOrNull(claim?.hold ?? null);
      const resolvedAt = hold?.resolved_at;
      if (!resolvedAt) return false;
      return resolvedAt < cutoffIso;
    });

    if (stale.length === 0) {
      return NextResponse.json({
        success: true,
        considered: evidenceRows?.length || 0,
        deletedStorage: 0,
        deletedRows: 0,
        timestamp: new Date().toISOString(),
      });
    }

    const storagePaths = stale.map((r) => r.storage_path);
    const rowIds = stale.map((r) => r.id);

    const { data: storageResult, error: storageError } = await supabaseAdmin
      .storage
      .from(EVIDENCE_BUCKET)
      .remove(storagePaths);

    if (storageError) {
      console.error("Evidence storage deletion failed:", storageError);
      // Continue to soft-delete rows anyway so we don't retry forever on
      // already-missing objects.
    }

    const nowIso = new Date().toISOString();
    const { error: softDeleteError } = await supabaseAdmin
      .from("deposit_claim_evidence")
      .update({ deleted_at: nowIso })
      .in("id", rowIds);

    if (softDeleteError) {
      console.error("Evidence soft-delete failed:", softDeleteError);
      return NextResponse.json(
        { error: softDeleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      considered: evidenceRows?.length || 0,
      deletedStorage: storageResult?.length || 0,
      deletedRows: rowIds.length,
      timestamp: nowIso,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Evidence retention cron failed";
    console.error("Deposit evidence retention cron failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
