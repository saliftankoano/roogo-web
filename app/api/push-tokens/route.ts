import { cors, corsOptions } from "@/lib/api-helpers";
import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { getSupabaseClient, getUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  try {
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
      clerkUserId = sub;
    } catch (error) {
      console.error("Token verification failed:", error);
      return cors(
        NextResponse.json({ error: "Invalid token" }, { status: 401 })
      );
    }

    if (!clerkUserId) {
      return cors(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    // 2. Get User from Supabase
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return cors(
        NextResponse.json({ error: "User not found" }, { status: 404 })
      );
    }

    // 3. Parse Body
    const body = await req.json();
    const { expoPushToken, platform } = body;

    if (!expoPushToken) {
      return cors(
        NextResponse.json({ error: "Missing expoPushToken" }, { status: 400 })
      );
    }

    const supabase = getSupabaseClient();

    // 4. Upsert Push Token
    const { error } = await supabase.from("user_push_tokens").upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        platform: platform || "unknown",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" }
    );

    if (error) {
      console.error("Error upserting push token:", error);
      return cors(
        NextResponse.json({ error: "Failed to register token" }, { status: 500 })
      );
    }

    return cors(NextResponse.json({ success: true }));
  } catch (error: unknown) {
    console.error("Push token registration error:", error);
    return cors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      )
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      return cors(
        NextResponse.json({ error: "Missing token" }, { status: 401 })
      );
    }

    const body = await req.json();
    const { expoPushToken } = body;

    if (!expoPushToken) {
      return cors(
        NextResponse.json({ error: "Missing expoPushToken" }, { status: 400 })
      );
    }

    const supabase = getSupabaseClient();

    // Remove token (no need to verify user for deletion if token matches)
    const { error } = await supabase
      .from("user_push_tokens")
      .delete()
      .eq("expo_push_token", expoPushToken);

    if (error) {
      console.error("Error deleting push token:", error);
      return cors(
        NextResponse.json({ error: "Failed to delete token" }, { status: 500 })
      );
    }

    return cors(NextResponse.json({ success: true }));
  } catch (error: unknown) {
    return cors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      )
    );
  }
}


