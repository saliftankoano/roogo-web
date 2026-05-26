import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSupabaseUser } from "@/lib/referral-auth";
import { getSupabaseClient } from "@/lib/user-sync";

const updateSchema = z.object({
  status: z.enum(["approved", "rejected", "suspended"]),
  rejectionReason: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdminSupabaseUser();
    const { id } = await params;
    const body = updateSchema.parse(await req.json());

    const payload: Record<string, unknown> = {
      status: body.status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.id,
      rejection_reason:
        body.status === "rejected" ? body.rejectionReason || null : null,
    };

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("referrer_profiles")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, profile: data });
  } catch (error) {
    console.error("PATCH /api/admin/referrals/[id] error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 400 });
  }
}
