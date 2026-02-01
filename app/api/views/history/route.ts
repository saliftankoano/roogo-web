import { auth } from "@clerk/nextjs/server";
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
  }
);

interface PropertyImage {
  url: string;
}

interface HistoryProperty {
  id: string;
  property_images?: PropertyImage[];
  [key: string]: unknown;
}


/**
 * GET /api/views/history - Get user's view history
 */
export async function GET(_request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get Supabase user ID from Clerk ID
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", clerkId)
      .maybeSingle();

    if (!userData?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = userData.id;

    // Get view history
    const { data, error } = await supabaseAdmin
      .from("property_views")
      .select(
        `
        id,
        viewed_at,
        property:properties!inner(*)
      `
      )
      .eq("user_id", userId)
      .order("viewed_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching view history:", error);
      return NextResponse.json(
        { error: "Failed to fetch view history" },
        { status: 500 }
      );
    }

    // Remove duplicates (keep most recent view of each property)
    const seenProps = new Set();
    const uniqueHistory = [];

    for (const item of data || []) {
      const propId = (item.property as unknown as HistoryProperty)?.id;
      if (propId && !seenProps.has(propId)) {
        seenProps.add(propId);
        // Transform image structure
        const prop = item.property as unknown as HistoryProperty;
        if (prop?.property_images) {
          const images = prop.property_images.map((img: PropertyImage) => img.url);
          prop.image = images[0] ? { uri: images[0] } : null;
          delete prop.property_images;
        }
        uniqueHistory.push(item);
      }
    }

    return NextResponse.json(uniqueHistory);
  } catch (error) {
    console.error("Error in view history API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
