import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const digits = q.replace(/\D/g, "");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, full_name, email, phone, whatsapp, user_type")
    .eq("user_type", "renter")
    .order("full_name", { ascending: true, nullsFirst: false })
    .limit(200);

  if (error) return errorResponse("Failed to load renters", 500, req);

  const users = (data ?? []).filter((user) => {
    if (!q) return true;
    const textMatch = [user.full_name, user.email].some((value) =>
      value?.toLowerCase().includes(q.toLowerCase()),
    );
    const phoneMatch =
      digits.length > 0 &&
      [user.phone, user.whatsapp].some((value) =>
        value?.replace(/\D/g, "").includes(digits),
      );
    return textMatch || phoneMatch;
  });

  return cors(NextResponse.json({ users: users.slice(0, 25) }), req);
}
