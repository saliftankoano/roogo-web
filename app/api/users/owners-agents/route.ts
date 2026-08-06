import { verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import { getOrSyncUserByClerkId, getSupabaseClient } from "@/lib/user-sync";
import { cors, errorResponse } from "@/lib/api-helpers";
import { redis } from "@/lib/rate-limit";

export interface OwnersAgentsUser {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  user_type: string;
}

const CACHE_KEY = "owners-agents:v2";
const CACHE_TTL_S = 300; // 5 minutes

function filterUsers(users: OwnersAgentsUser[], q: string): OwnersAgentsUser[] {
  if (!q) return users;
  const lower = q.toLowerCase();
  const digits = q.replace(/\D/g, "");
  return users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(lower) ||
      u.email?.toLowerCase().includes(lower) ||
      (digits.length > 0 &&
        [u.phone, u.whatsapp].some((value) =>
          value?.replace(/\D/g, "").includes(digits),
        )),
  );
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      return errorResponse("Missing token", 401, req);
    }

    let clerkUserId: string | undefined;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub as string | undefined;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    if (!clerkUserId) {
      return errorResponse("Unauthorized", 401, req);
    }

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) {
      return errorResponse("User not found", 404, req);
    }

    const isStaffOrFounder = user.user_type === "staff" || user.user_type === "founder";
    if (!isStaffOrFounder) {
      return errorResponse("Forbidden: staff or founder only", 403, req);
    }

    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

    // Try cache first
    const cached = await redis?.get<OwnersAgentsUser[]>(CACHE_KEY);
    if (cached) {
      return cors(NextResponse.json({ users: filterUsers(cached, q) }), req);
    }

    // Cache miss — query Supabase
    const supabase = getSupabaseClient();
    const { data: users, error } = await supabase
      .from("users")
      .select("id, full_name, email, phone, whatsapp, user_type")
      .in("user_type", ["owner", "agent"])
      .order("full_name", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("Error fetching owners/agents:", error);
      return errorResponse("Failed to load users", 500, req);
    }

    const items: OwnersAgentsUser[] = (users ?? []).map((u) => ({
      id: u.id,
      full_name: u.full_name ?? null,
      email: u.email ?? null,
      phone: u.phone ?? null,
      whatsapp: u.whatsapp ?? null,
      user_type: u.user_type ?? "owner",
    }));

    // Store in cache
    await redis?.set(CACHE_KEY, items, { ex: CACHE_TTL_S });

    return cors(NextResponse.json({ users: filterUsers(items, q) }), req);
  } catch (error) {
    console.error("Error in GET /api/users/owners-agents:", error);
    return errorResponse("An unexpected error occurred", 500, req);
  }
}
