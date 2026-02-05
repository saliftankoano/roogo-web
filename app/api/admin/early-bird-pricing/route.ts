import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth, clerkClient } from "@clerk/nextjs/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userType = user.publicMetadata?.userType;

    if (userType !== "founder") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: config, error } = await supabaseAdmin
      .from("early_bird_config")
      .select("*")
      .eq("id", "default")
      .single();

    if (error) {
      console.error("Error fetching early bird config:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userType = user.publicMetadata?.userType;

    if (userType !== "founder") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { rate, minimum_charge, duration_hours } = body;

    if (rate === undefined || minimum_charge === undefined || duration_hours === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: rate, minimum_charge, duration_hours" },
        { status: 400 }
      );
    }

    if (rate < 0 || rate > 1) {
      return NextResponse.json(
        { error: "Rate must be between 0 and 1 (0% to 100%)" },
        { status: 400 }
      );
    }

    if (minimum_charge < 0) {
      return NextResponse.json(
        { error: "Minimum charge must be non-negative" },
        { status: 400 }
      );
    }

    if (duration_hours <= 0) {
      return NextResponse.json(
        { error: "Duration must be greater than 0 hours" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("early_bird_config")
      .update({
        rate,
        minimum_charge,
        duration_hours,
      })
      .eq("id", "default")
      .select()
      .single();

    if (error) {
      console.error("Error updating early bird config:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
