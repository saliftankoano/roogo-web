import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { getSupabaseClient, getUserByClerkId } from "@/lib/user-sync";

/**
 * @description Handle OPTIONS request for CORS
 */
export async function OPTIONS() {
  return cors(NextResponse.json({ ok: true }));
}

/**
 * @description Handle GET request to fetch transactions for a property
 * @param req - Request object
 * @param context - Route context containing params
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;

    // 1. Verify Clerk Token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      return cors(
        NextResponse.json({ error: "Missing token" }, { status: 401 })
      );
    }

    let clerkUserId: string | undefined;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub as string | undefined;
    } catch (error) {
      console.error("Token verification failed:", error);
      return cors(
        NextResponse.json({ error: "Invalid token" }, { status: 401 })
      );
    }

    if (!clerkUserId) {
      return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    // 2. Get user from Supabase to verify ownership
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return cors(NextResponse.json({ error: "User not found" }, { status: 404 }));
    }

    const supabase = getSupabaseClient();

    // 3. Check if user is the owner of the property
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("agent_id")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      return cors(
        NextResponse.json({ error: "Property not found" }, { status: 404 })
      );
    }

    // Only the agent/owner can see the transactions for their property
    // (Or staff members)
    if (property.agent_id !== user.id && user.user_type !== "staff") {
      return cors(
        NextResponse.json({ error: "Forbidden: Not your property" }, { status: 403 })
      );
    }

    // 4. Fetch transactions for this property
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (txError) {
      console.error("Error fetching transactions:", txError);
      return cors(
        NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 })
      );
    }

    return cors(
      NextResponse.json({
        success: true,
        transactions: transactions || [],
      })
    );
  } catch (error: unknown) {
    console.error("Error in GET /api/payments/property/[id]:", error);
    return cors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      )
    );
  }
}

function cors(res: NextResponse) {
  res.headers.set(
    "Access-Control-Allow-Origin",
    process.env.CORS_ORIGIN || "*"
  );
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return res;
}
