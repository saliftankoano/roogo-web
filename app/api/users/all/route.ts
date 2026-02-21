import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";

export interface FullUser {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: string;
  company_name: string | null;
  professional_link: string | null;
  whatsapp: string | null;
  preferred_city: string | null;
  budget_max: number | null;
  service_areas: string[] | null;
  portfolio_size: string | null;
  referral_source: string | null;
  preferences: Record<string, unknown> | null;
  created_at: string;
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const userType = user?.publicMetadata?.userType;
    if (!["staff", "founder", "admin"].includes(userType as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseClient();
    const { data: users, error } = await supabase
      .from("users")
      .select(`
        id,
        full_name,
        email,
        phone,
        avatar_url,
        user_type,
        company_name,
        professional_link,
        whatsapp,
        preferred_city,
        budget_max,
        service_areas,
        portfolio_size,
        referral_source,
        preferences,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching all users:", error);
      return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
    }

    return NextResponse.json({ users: users ?? [] });
  } catch (error) {
    console.error("Error in GET /api/users/all:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
