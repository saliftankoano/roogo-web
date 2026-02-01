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
  is_primary?: boolean;
}

interface PropertyData {
  id: string;
  title?: string;
  quartier?: string;
  city?: string;
  address?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  parking_spaces?: number;
  period?: string;
  property_images?: PropertyImage[];
  property_type?: string;
  is_boosted?: boolean;
  status?: string;
}

interface FavoriteItem {
  property_id: string;
  created_at: string;
  properties: PropertyData | null;
}


async function getSupabaseUserId(clerkId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("clerk_id", clerkId)
    .maybeSingle();
  return data?.id || null;
}

/**
 * GET /api/favorites - Get user's favorites
 */
export async function GET(_request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getSupabaseUserId(clerkId);
    if (!userId) {
      return NextResponse.json({ success: true, favorites: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("user_favorites")
      .select(`
        property_id,
        created_at,
        properties:property_id (
          *,
          property_images (
            id,
            url,
            width,
            height,
            is_primary
          ),
          users:agent_id (
            id,
            full_name,
            avatar_url,
            phone,
            email
          )
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching favorites:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform to match expected format
    const rawData = data as unknown as FavoriteItem[];
    const favorites = (rawData || [])
      .filter((item) => item.properties)
      .map((item) => {
        const prop = item.properties!;
        const primaryImage = prop.property_images?.find((img) => img.is_primary) || prop.property_images?.[0];
        
        return {
          id: prop.id,
          uuid: prop.id,
          title: prop.title || "Sans titre",
          location: prop.quartier ? `${prop.quartier}, ${prop.city || "Ouagadougou"}` : "Ouagadougou",
          address: prop.address || "",
          price: (prop.price || 0).toString(),
          bedrooms: prop.bedrooms || 0,
          bathrooms: prop.bathrooms || 0,
          area: (prop.area || 0).toString(),
          parking: prop.parking_spaces || 0,
          period: prop.period === "month" || prop.period === "Mois" ? "Mois" : undefined,
          image: primaryImage ? { uri: primaryImage.url } : null,
          images: prop.property_images?.map((img) => ({ uri: img.url })),
          category: prop.property_type === "commercial" ? "Business" : "Residential",
          isSponsored: !!prop.is_boosted,
          status: prop.status || "en_attente",
          propertyType: prop.property_type,
        };
      });

    return NextResponse.json({ success: true, favorites });
  } catch (error) {
    console.error("Error in favorites API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/favorites - Add or remove favorite
 */
export async function POST(req: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getSupabaseUserId(clerkId);
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { propertyId, action } = await req.json();

    if (action === "add") {
      const { error } = await supabaseAdmin
        .from("user_favorites")
        .insert({ user_id: userId, property_id: propertyId });

      if (error) {
        console.error("Error adding favorite:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: "added" });
    } else if (action === "remove") {
      const { error } = await supabaseAdmin
        .from("user_favorites")
        .delete()
        .eq("user_id", userId)
        .eq("property_id", propertyId);

      if (error) {
        console.error("Error removing favorite:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: "removed" });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in favorites POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
