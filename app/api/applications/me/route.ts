import { auth } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

async function getSupabaseUserId(clerkId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("clerk_id", clerkId)
    .maybeSingle();
  return data?.id || null;
}

async function resolveClerkId(req: Request): Promise<string | null> {
  const { userId } = await auth();
  if (userId) return userId;

  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return null;

  try {
    const { sub } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    return sub ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/applications/me - Get current user's applications
 */
export async function GET(req: Request) {
  try {
    const clerkId = await resolveClerkId(req);
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getSupabaseUserId(clerkId);
    if (!userId) {
      return NextResponse.json({ success: true, applications: [] });
    }

    // Fetch all applications for this user
    const { data, error } = await supabaseAdmin
      .from("applications")
      .select("id, property_id, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching user applications:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, applications: data || [] });
  } catch (error) {
    console.error("Error in applications GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
