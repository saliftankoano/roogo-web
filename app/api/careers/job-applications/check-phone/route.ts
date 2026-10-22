import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  DUPLICATE_APPLICATION_MESSAGE,
  getJobRole,
  normalizeBurkinaPhone,
} from "@/lib/job-applications";
import {
  checkRateLimit,
  jobApplicationIpLimiter,
  requestIp,
} from "@/lib/rate-limit";

// Public: tells a candidate after step 1 that this number already applied,
// before they spend data on a video. Rate limited per IP; answers only
// yes or no, never the application itself.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { role?: string; phone?: string };
    const role = getJobRole(body.role);
    const phone = normalizeBurkinaPhone(body.phone);
    if (!role || !phone) {
      return NextResponse.json({ success: false, error: "Numéro WhatsApp invalide." }, { status: 400 });
    }

    const limit = await checkRateLimit(jobApplicationIpLimiter, requestIp(req));
    if (!limit.success) {
      return NextResponse.json(
        { success: false, error: "Trop de tentatives depuis cette connexion. Réessaie dans une heure." },
        { status: 429, headers: limit.headers },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .select("id")
      .eq("role_slug", role.slug)
      .eq("phone", phone)
      .limit(1);

    if (error) {
      // Before migration 104 runs, or a transient error: do not block the candidate.
      console.error("POST /api/careers/job-applications/check-phone:", error.code, error.message);
      return NextResponse.json({ success: true, alreadyApplied: false });
    }

    const alreadyApplied = (data ?? []).length > 0;
    return NextResponse.json({
      success: true,
      alreadyApplied,
      ...(alreadyApplied ? { message: DUPLICATE_APPLICATION_MESSAGE } : {}),
    });
  } catch (error) {
    console.error("POST /api/careers/job-applications/check-phone:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: true, alreadyApplied: false });
  }
}
