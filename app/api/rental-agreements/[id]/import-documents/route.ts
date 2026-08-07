import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser, isStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "rental-agreement-imports";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(req);
  if (!user) return errorResponse("Unauthorized", 401, req);
  const { id } = await params;
  const { data: agreement } = await supabaseAdmin
    .from("rental_agreements")
    .select("id, owner_id, renter_id, signature_source")
    .eq("id", id)
    .maybeSingle();
  if (!agreement) return errorResponse("Agreement not found", 404, req);
  const isStaff = isStaffOrFounder(user);
  if (!isStaff && agreement.owner_id !== user.id && agreement.renter_id !== user.id) {
    return errorResponse("Forbidden", 403, req);
  }
  if (agreement.signature_source !== "offline_import") {
    return errorResponse("Agreement was not imported", 404, req);
  }

  const { data: importRow } = await supabaseAdmin
    .from("rental_agreement_imports")
    .select("*")
    .eq("agreement_id", id)
    .single();
  if (!importRow) return errorResponse("Import record not found", 404, req);
  const paths = Array.isArray(importRow.signed_document_paths)
    ? importRow.signed_document_paths.filter((path: unknown): path is string => typeof path === "string")
    : [];
  const documents = await Promise.all(
    paths.map(async (path: string) => {
      const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600);
      return { path, url: data?.signedUrl ?? null, name: path.split("/").pop() ?? "bail" };
    }),
  );
  const shared = {
    external_signed_at: importRow.external_signed_at,
    rent_months_paid: importRow.rent_months_paid,
    offline_rent_amount: importRow.offline_rent_amount,
    caution_amount: importRow.caution_amount,
    payment_date: importRow.payment_date,
    payment_method: importRow.payment_method,
    payment_reference: importRow.payment_reference,
    documents,
  };
  return cors(NextResponse.json({
    import: isStaff ? { ...shared, commission_amount: importRow.commission_amount, commission_date: importRow.commission_date, commission_method: importRow.commission_method, commission_reference: importRow.commission_reference, notes: importRow.notes, imported_by: importRow.imported_by } : shared,
  }), req);
}
