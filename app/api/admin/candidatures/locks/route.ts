import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await currentUser();
    const userType = user?.publicMetadata?.userType;
    if (!["staff", "founder", "admin"].includes(userType as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select(`
        id, amount, currency, status, provider, payer_phone, created_at, property_id, user_id,
        properties!transactions_property_id_fkey ( id, quartier, city ),
        users!transactions_user_id_fkey ( full_name, phone )
      `)
      .eq("type", "property_lock")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, transactions: data || [] });
  } catch (error) {
    console.error("Admin candidatures locks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
