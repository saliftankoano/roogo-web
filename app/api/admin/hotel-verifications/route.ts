import { NextResponse } from "next/server";
import { HOTEL_BUSINESS_DOCUMENTS_BUCKET } from "@/lib/hotel-business-verification";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const auth = await requireStaffSupabaseUser();
  if ("error" in auth) return auth.error;
  const status = new URL(req.url).searchParams.get("status") || "pending";
  let query = supabaseAdmin
    .from("hotel_business_verification_submissions")
    .select("*, hotel:hotel_id(id, name, city, phone, business_verification_status)")
    .order("submitted_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load verifications" }, { status: 500 });

  const rows = await Promise.all(
    (data || []).map(async (submission) => {
      const { data: signed } = await supabaseAdmin.storage
        .from(HOTEL_BUSINESS_DOCUMENTS_BUCKET)
        .createSignedUrl(submission.document_storage_path, 30 * 60);
      return { ...submission, documentUrl: signed?.signedUrl || null };
    }),
  );
  return NextResponse.json({ success: true, submissions: rows });
}
