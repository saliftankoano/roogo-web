import { NextResponse } from "next/server";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getJobRole, isApplicationStatus } from "@/lib/job-applications";

// Staff review list for one role (Fondateur and Directeur: "talent.manage").
// Newest first, optional status filter, plus the count per status.
export async function GET(req: Request) {
  try {
    const reviewer = await getStaffOrFounder(req, "talent.manage");
    if (!reviewer) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const role = getJobRole(url.searchParams.get("role"));
    if (!role) {
      return NextResponse.json({ success: false, error: "Offre inconnue." }, { status: 400 });
    }
    const status = url.searchParams.get("status");

    let query = supabaseAdmin
      .from("job_applications")
      .select("id, created_at, full_name, phone, quartier, status, video_path, video_url, sales, reviewed_at")
      .eq("role_slug", role.slug)
      .order("created_at", { ascending: false })
      .limit(500);
    if (isApplicationStatus(status)) query = query.eq("status", status);

    const [{ data, error }, counts] = await Promise.all([
      query,
      supabaseAdmin.from("job_applications").select("status").eq("role_slug", role.slug),
    ]);

    if (error) {
      const notMigrated = error.code === "42P01" || error.code === "PGRST205";
      return NextResponse.json(
        {
          success: false,
          error: notMigrated
            ? "La table des candidatures n'existe pas encore (migration 104 à exécuter)."
            : "Impossible de charger les candidatures.",
        },
        { status: notMigrated ? 503 : 500 },
      );
    }

    const byStatus: Record<string, number> = {};
    for (const row of counts.data ?? []) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

    return NextResponse.json({
      success: true,
      applications: (data ?? []).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        fullName: row.full_name,
        phone: row.phone,
        quartier: row.quartier,
        status: row.status,
        hasVideo: Boolean(row.video_path || row.video_url),
        salesCount: Array.isArray(row.sales) ? row.sales.length : 0,
        reviewedAt: row.reviewed_at,
      })),
      counts: byStatus,
    });
  } catch (error) {
    console.error("GET /api/admin/recrutement/applications:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Erreur interne du serveur." }, { status: 500 });
  }
}
