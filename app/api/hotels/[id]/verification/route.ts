import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { normalizeRccmSubmission } from "@/lib/hotel-business-verification";
import { getHotelMembership } from "@/lib/hotel-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);
    const membership = await getHotelMembership(user.id, id);
    if (!membership) return errorResponse("Forbidden", 403, req);
    const { data: hotel, error } = await supabaseAdmin
      .from("hotels")
      .select(
        "id, business_verification_status, business_verified_at, business_verification_rejection_reason",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    const { data: latest } = await supabaseAdmin
      .from("hotel_business_verification_submissions")
      .select("id, legal_name, rccm_number, tax_number, status, submitted_at, rejection_reason")
      .eq("hotel_id", id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return cors(
      NextResponse.json({
        success: true,
        verification: {
          status: hotel.business_verification_status,
          verifiedAt: hotel.business_verified_at,
          rejectionReason: hotel.business_verification_rejection_reason,
          latestSubmission: latest
            ? {
                id: latest.id,
                legalName: latest.legal_name,
                rccmNumber: latest.rccm_number,
                taxNumber: latest.tax_number,
                status: latest.status,
                submittedAt: latest.submitted_at,
                rejectionReason: latest.rejection_reason,
              }
            : null,
        },
      }),
      req,
    );
  } catch (error) {
    console.error("GET hotel RCCM verification:", error);
    return errorResponse("Failed to load verification", 500, req);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);
    const membership = await getHotelMembership(user.id, id);
    if (membership?.role !== "admin") return errorResponse("Forbidden", 403, req);
    const parsed = normalizeRccmSubmission(await req.json().catch(() => ({})));
    if ("error" in parsed) return errorResponse(parsed.error, 400, req);
    if (!parsed.value.document_storage_path.startsWith(`${id}/`)) {
      return errorResponse("Invalid document path", 400, req);
    }

    await supabaseAdmin
      .from("hotel_business_verification_submissions")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        rejection_reason: "Remplacé par une nouvelle soumission.",
      })
      .eq("hotel_id", id)
      .eq("status", "pending");

    const { data: submission, error } = await supabaseAdmin
      .from("hotel_business_verification_submissions")
      .insert({ hotel_id: id, submitted_by: user.id, ...parsed.value })
      .select("id, status, submitted_at")
      .single();
    if (error) throw error;
    const { error: hotelError } = await supabaseAdmin
      .from("hotels")
      .update({
        business_verification_status: "pending",
        business_verified_at: null,
        business_verified_by: null,
        business_verification_rejection_reason: null,
      })
      .eq("id", id);
    if (hotelError) throw hotelError;
    return cors(NextResponse.json({ success: true, submission }), req);
  } catch (error) {
    console.error("POST hotel RCCM verification:", error);
    return errorResponse("Failed to submit verification", 500, req);
  }
}
