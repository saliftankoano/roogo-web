import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {

interface PropertyImage {
  url: string;
}

interface HistoryProperty {
  id: string;
  property_images?: PropertyImage[];
  [key: string]: unknown;
}

interface HistoryItem {
  property: HistoryProperty;
}

    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * GET /api/views/history - Get user's view history
 */
export async function GET(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);

    const { data, error } = await supabaseAdmin
      .from("property_views")
      .select(`
        viewed_at,
        property:properties (
          id,
          title,
          price,
          address,
          property_type,
          listing_type,
          property_images (
            url
          )
        )
      `)
      .eq("clerk_id", clerkId)
      .order("viewed_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching view history:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter out duplicates (keep most recent view per property)
    const seenProps = new Set();
    const uniqueHistory = [];

    for (const item of data || []) {
      const propId = (item.property as HistoryProperty)?.id;
      if (propId && !seenProps.has(propId)) {
        seenProps.add(propId);
        // Transform image structure
        const prop = item.property as HistoryProperty;
        if (prop?.property_images) {
          const images = prop.property_images.map((img: PropertyImage) => img.url);
          prop.image = images[0] ? { uri: images[0] } : null;
          delete prop.property_images;
        }
        uniqueHistory.push(item);
      }
    }

    return NextResponse.json({ success: true, history: uniqueHistory });
  } catch (error) {
    console.error("Error in get view history:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
