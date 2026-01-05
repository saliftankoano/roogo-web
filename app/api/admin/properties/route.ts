import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseClient, getUserByClerkId } from "@/lib/user-sync";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function requireStaff() {
  const { userId } = await auth();
  if (!userId) return { ok: false as const, res: json({ error: "Unauthorized" }, 401) };

  const user = await getUserByClerkId(userId);
  if (!user || user.user_type !== "staff") {
    return { ok: false as const, res: json({ error: "Forbidden" }, 403) };
  }

  return { ok: true as const };
}

export async function GET() {
  const staff = await requireStaff();
  if (!staff.ok) return staff.res;

  try {
    const supabase = getSupabaseClient();

    // Prefer `property_details` view if present; fall back to `properties`.
    const { data: details, error: detailsErr } = await supabase
      .from("property_details")
      .select("id, title, city, quartier")
      .order("created_at", { ascending: false });

    if (!detailsErr && details) {
      return json({
        properties: details.map((p) => ({
          id: p.id as string,
          title: (p.title as string) || "",
          city: (p.city as string) || "",
          quartier: (p.quartier as string) || "",
        })),
      });
    }

    const { data, error } = await supabase
      .from("properties")
      .select("id, title, city, quartier")
      .order("created_at", { ascending: false });

    if (error) return json({ error: error.message }, 500);

    return json({
      properties: (data || []).map((p) => ({
        id: p.id as string,
        title: (p.title as string) || "",
        city: (p.city as string) || "",
        quartier: (p.quartier as string) || "",
      })),
    });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "An unexpected error occurred" },
      500
    );
  }
}

