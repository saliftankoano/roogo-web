import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSupabaseUser } from "@/lib/referral-auth";
import { getSupabaseClient } from "@/lib/user-sync";

const updateSchema = z.object({
  status: z.enum(["approved", "paid", "cancelled"]),
  payoutReference: z.string().optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = updateSchema.parse(await req.json());
    const actor =
      body.status === "paid"
        ? await requireAdminSupabaseUser(["founder"])
        : await requireAdminSupabaseUser();

    const payload: Record<string, unknown> = {
      status: body.status,
      payout_reference: body.payoutReference || null,
      notes: body.notes || null,
    };

    if (body.status === "paid") {
      payload.paid_at = new Date().toISOString();
      payload.paid_by = actor.id;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("referral_commissions")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, commission: data });
  } catch (error) {
    console.error("PATCH /api/admin/referrals/commissions/[id] error:", error);
    return NextResponse.json(
      { error: "Commission update forbidden" },
      { status: 403 },
    );
  }
}
