import { NextResponse } from "next/server";
import { z } from "zod";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { APPLICATION_STATUSES } from "@/lib/job-applications";
import { signedReadUrl } from "@/lib/job-applications-server";

type Params = { params: Promise<{ id: string }> };

// One application for the staff review (talent.manage). CV and video are in
// the private bucket: they come back as signed links valid 10 minutes.
export async function GET(req: Request, context: Params) {
  try {
    const reviewer = await getStaffOrFounder(req, "talent.manage");
    if (!reviewer) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ success: false, error: "Candidature introuvable." }, { status: 404 });
    }

    const { data: row, error } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`${error.code} ${error.message}`);
    if (!row) {
      return NextResponse.json({ success: false, error: "Candidature introuvable." }, { status: 404 });
    }

    const [cvUrl, videoSignedUrl, reviewerRow] = await Promise.all([
      signedReadUrl(row.cv_path),
      signedReadUrl(row.video_path),
      row.reviewed_by
        ? supabaseAdmin.from("users").select("full_name").eq("id", row.reviewed_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return NextResponse.json({
      success: true,
      application: {
        id: row.id,
        roleSlug: row.role_slug,
        createdAt: row.created_at,
        fullName: row.full_name,
        phone: row.phone,
        quartier: row.quartier,
        email: row.email,
        cvUrl,
        cvIsPdf: typeof row.cv_path === "string" && row.cv_path.endsWith(".pdf"),
        sales: row.sales ?? [],
        reference: row.reference ?? null,
        videoSignedUrl,
        videoUrl: row.video_url,
        listing: row.listing_snapshot ?? null,
        answers: row.answers ?? {},
        canStartOnDate: row.can_start_on_date,
        availableFrom: row.available_from,
        status: row.status,
        reviewerNotes: row.reviewer_notes ?? "",
        reviewedAt: row.reviewed_at,
        reviewedByName: (reviewerRow.data as { full_name?: string | null } | null)?.full_name ?? null,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/recrutement/applications/[id]:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Impossible de charger la candidature." }, { status: 500 });
  }
}

const reviewSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    reviewerNotes: z.string().max(4000, "Notes : 4000 caractères maximum.").optional(),
  })
  .refine((v) => v.status !== undefined || v.reviewerNotes !== undefined, { message: "Rien à enregistrer." });

export async function PATCH(req: Request, context: Params) {
  try {
    const reviewer = await getStaffOrFounder(req, "talent.manage");
    if (!reviewer) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ success: false, error: "Candidature introuvable." }, { status: 404 });
    }
    const parsed = reviewSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Données invalides." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { reviewed_by: reviewer.id, reviewed_at: now, updated_at: now };
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.reviewerNotes !== undefined) updates.reviewer_notes = parsed.data.reviewerNotes.trim() || null;

    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .update(updates)
      .eq("id", id)
      .select("id, status, reviewer_notes, reviewed_at")
      .maybeSingle();
    if (error) throw new Error(`${error.code} ${error.message}`);
    if (!data) {
      return NextResponse.json({ success: false, error: "Candidature introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      application: {
        id: data.id,
        status: data.status,
        reviewerNotes: data.reviewer_notes ?? "",
        reviewedAt: data.reviewed_at,
        reviewedByName: reviewer.full_name ?? null,
      },
    });
  } catch (error) {
    console.error("PATCH /api/admin/recrutement/applications/[id]:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Impossible d'enregistrer." }, { status: 500 });
  }
}
